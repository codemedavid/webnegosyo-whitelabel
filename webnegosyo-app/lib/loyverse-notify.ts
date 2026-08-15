import { getWebAppUrl } from "./web-app-url";
import { supabase } from "./supabase";

/**
 * Fire-and-forget: ask the platform to push an order into Loyverse as a sales
 * receipt (mirrors pos-stock-notify.ts — same auth, same never-throw contract).
 *
 * The Loyverse access token lives only on the web server, so the app can never
 * push directly. The server decides everything policy-shaped: whether the
 * tenant has Loyverse enabled, whether the push mode allows this trigger, and
 * whether the order was already pushed.
 *
 * Two shapes, matching /api/loyverse:
 * - platform-backend orders: send { orderId } and the server reads the lines
 *   and records the outcome on the order row.
 * - Convex orders / POS counter sales: send { items, orderNumber } — there is
 *   no platform row, so THIS CALL must fire exactly once (it hangs off the
 *   confirm transition / tender completion, which run once).
 */
export interface LoyverseOrderLine {
  menu_item_id: string;
  menu_item_name: string;
  variations?: Record<string, string>;
  variation?: string;
  addons: string[];
  quantity: number;
  price: number;
  subtotal: number;
  special_instructions?: string;
}

export async function notifyLoyverseOrderConfirmed(
  tenantId: string,
  order: { orderId?: string; orderNumber?: string; items?: readonly LoyverseOrderLine[] },
): Promise<void> {
  await postLoyversePush({
    tenantId,
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    items: order.items,
    context: "order_confirm",
  });
}

interface PosLineLike {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  note?: string;
  selections: readonly {
    groupName: string;
    optionId: string;
    optionName: string;
  }[];
}

/**
 * Register cart lines → platform OrderItem shape. Synced options carry their
 * Loyverse identity in the option id (`lv-` variants, `lvm-` modifiers), so
 * selections are routed to the field the server resolves each kind from;
 * unrecognised ids go to both, which at worst reports as unmapped.
 */
export function posLinesToLoyverseOrderLines(lines: readonly PosLineLike[]): LoyverseOrderLine[] {
  return lines.map((line) => {
    const variations: Record<string, string> = {};
    const addons: string[] = [];
    for (const selection of line.selections) {
      const isVariant = selection.optionId.startsWith("lv-");
      const isModifier = selection.optionId.startsWith("lvm-");
      if (isModifier) {
        addons.push(selection.optionName);
      } else if (isVariant) {
        variations[selection.groupName] = selection.optionName;
      } else {
        variations[selection.groupName] = selection.optionName;
        addons.push(selection.optionName);
      }
    }
    return {
      menu_item_id: line.menuItemId,
      menu_item_name: line.name,
      variations: Object.keys(variations).length > 0 ? variations : undefined,
      addons,
      quantity: line.quantity,
      price: line.unitPrice,
      subtotal: line.subtotal,
      special_instructions: line.note,
    };
  });
}

export async function notifyLoyversePosSale(
  tenantId: string,
  orderNumber: string | undefined,
  items: readonly LoyverseOrderLine[],
): Promise<void> {
  if (items.length === 0) return;
  await postLoyversePush({ tenantId, orderNumber, items, context: "pos_sale" });
}

/** Never throws — the sale/confirmation already succeeded when this runs. */
async function postLoyversePush(body: Record<string, unknown>): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    await fetch(`${getWebAppUrl()}/api/loyverse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Best-effort: a missing Loyverse receipt is reconcilable in Back Office;
    // a tender or confirm screen that fails because of it is not.
  }
}
