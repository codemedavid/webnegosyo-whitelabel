/**
 * LIVE (opt-in): a register sale with "×2" of one add-on, end to end on the
 * shared platform database, as the real signed-in role.
 *
 *   POS_ADDON_LIVE=1 NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… \
 *   SUPABASE_SERVICE_ROLE_KEY=… npx jest lib/pos-addon-amounts.live.test.ts
 *
 * Only ever touches the designated test store `sample-demo`. Signs in as its
 * admin with a service-role magic link (no password, no email), reads a real
 * dish, builds the line with the register's own code (`setOptionPortions` →
 * `priceLine` → `buildPosOrder`), inserts it through the app's platform
 * adapter (`orders:createOrder`, RLS as `authenticated`), reads it back through
 * `orders:getOrderById`, re-opens it for editing (`hydratePosCart`), then
 * cancels it the way a cashier would. The cancelled order stays on the test
 * store as the run's evidence (its id is printed).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { isQuantityGroup, isOptionAvailable, normalizeModifierGroups, type ModifierSource } from "./modifier-groups";
import { optionPortions, setOptionPortions } from "./pos-addon-portions";
import { priceLine, type PosCartSelection } from "./pos-cart";
import { buildPosOrder } from "./pos-order";
import { runPlatformMutation, runPlatformQuery } from "./backends/supabase-adapter";
import type { PlatformClient } from "./backends/platform-client";
import { hydratePosCart } from "./order-edit-cart";

const LIVE = process.env.POS_ADDON_LIVE === "1";
const TEST_STORE = "sample-demo";
const ADMIN_EMAIL = "admin@sampledemowebnegosyo.com";

const describeLive = LIVE ? describe : describe.skip;

async function signedInClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: ADMIN_EMAIL });
  if (error || !link.properties?.hashed_token) throw new Error(`generateLink: ${error?.message ?? "no token"}`);
  const user = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: otpError } = await user.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (otpError) throw new Error(`verifyOtp: ${otpError.message}`);
  return user;
}

describeLive("register add-on amounts on the platform database (sample-demo)", () => {
  jest.setTimeout(60_000);

  it("writes, reads back and re-opens Fried-Rice-×2 style lines", async () => {
    const client = await signedInClient();

    const { data: tenant } = await client.from("tenants").select("id, slug").eq("slug", TEST_STORE).single();
    expect(tenant?.slug).toBe(TEST_STORE);
    const tenantId = tenant!.id as string;

    const { data: rows, error: menuError } = await client
      .from("menu_items")
      .select("id, name, price, discounted_price, modifier_groups, variation_types, variations, addons")
      .eq("tenant_id", tenantId)
      .eq("is_available", true);
    expect(menuError).toBeNull();

    // A dish whose ONLY groups are add-on amounts with a priced, available option.
    const dish = (rows ?? [])
      .map((row) => ({ row, groups: normalizeModifierGroups(row as unknown as ModifierSource) }))
      .find(({ groups }) =>
        groups.length > 0 &&
        groups.every((g) => isQuantityGroup(g) && g.min_select === 0) &&
        groups[0].options.some((o) => isOptionAvailable(o) && o.price_modifier > 0),
      );
    expect(dish).toBeDefined();
    const { row, groups } = dish!;
    const group = groups[0];
    const option = group.options.find((o) => isOptionAvailable(o) && o.price_modifier > 0)!;

    // The register: + + on the add-on.
    let selections: PosCartSelection[] = [];
    selections = setOptionPortions(selections, group, option, 1, null);
    selections = setOptionPortions(selections, group, option, 2, null);
    expect(optionPortions(selections, option.id)).toBe(2);

    const base = Number(row.discounted_price ?? row.price);
    const line = priceLine(
      { menuItemId: row.id as string, name: row.name as string, basePrice: base, listBasePrice: base, quantity: 1, selections },
      1,
    );
    const expectedTotal = Math.round((base + 2 * option.price_modifier) * 100) / 100;
    expect(line.subtotal).toBe(expectedTotal);

    const args = buildPosOrder({
      cart: [line],
      tender: null,
      clientOrderId: randomUUID(),
      customerName: "QA add-on amounts",
    });

    const created = (await runPlatformMutation(
      client as unknown as PlatformClient,
      tenantId,
      "orders:createOrder",
      args,
    )) as string | { orderId?: string; _id?: string; id?: string };
    const orderId = typeof created === "string" ? created : created.orderId ?? created._id ?? created.id;
    expect(orderId).toBeTruthy();
    // eslint-disable-next-line no-console
    console.log(`[live] sample-demo order ${orderId}: ${row.name} + ${option.name} ×2, total ${expectedTotal}`);

    try {
      // The stored row, as the same signed-in role reads it.
      const { data: items } = await client
        .from("order_items")
        .select("menu_item_name, quantity, price, subtotal, variation_selections, addons")
        .eq("order_id", orderId!);
      // eslint-disable-next-line no-console
      console.log("[live] order_items:", JSON.stringify(items));
      expect(items).toHaveLength(1);
      expect(Number(items![0].subtotal)).toBe(expectedTotal);
      expect(items![0].variation_selections).toEqual([
        { typeName: group.name, optionName: `${option.name} ×2`, priceAdjustment: 2 * option.price_modifier },
      ]);

      const { data: order } = await client.from("orders").select("total, source, status").eq("id", orderId!).single();
      expect(Number(order!.total)).toBe(expectedTotal);
      expect(order!.source).toBe("pos");

      // Re-opened for an edit: one line, the add-on at 2 portions, same price.
      const dto = (await runPlatformQuery(client as unknown as PlatformClient, tenantId, "orders:getOrderById", {
        orderId,
      })) as { items: Parameters<typeof hydratePosCart>[0] };
      const hydrated = hydratePosCart(dto.items, { [row.id as string]: groups });
      // eslint-disable-next-line no-console
      console.log("[live] hydrated:", JSON.stringify(hydrated.lines.map((l) => ({ s: l.selections, sub: l.subtotal }))));
      expect(hydrated.unresolved).toEqual([]);
      expect(hydrated.lines).toHaveLength(1);
      expect(hydrated.lines[0].selections).toEqual([
        expect.objectContaining({ optionId: option.id, portions: 2, priceModifier: 2 * option.price_modifier }),
      ]);
      expect(hydrated.lines[0].subtotal).toBe(expectedTotal);
    } finally {
      await runPlatformMutation(client as unknown as PlatformClient, tenantId, "orders:updateOrderStatus", {
        orderId,
        status: "cancelled",
      });
      const { data: after } = await client.from("orders").select("status").eq("id", orderId!).single();
      // eslint-disable-next-line no-console
      console.log(`[live] cleanup: order ${orderId} status ${after?.status}`);
    }
  });
});
