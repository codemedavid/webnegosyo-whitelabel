import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateTender } from "@/lib/loyalty/tender";
import { hasPermission } from "@/lib/staff-permissions";
import { isDeepStrictEqual } from "node:util";

/**
 * A canonical receipt, not a second call to the legacy POS order creator.
 * Quotes and their payment policy are written by trusted server code only.
 * SQL owns atomicity and exact-retry semantics, including retries after expiry.
 * Keep gated until verified claims, quote writers and projection workers ship.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const authorization = request.headers.get("authorization");
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization))
    return respond({ error: "Unauthorized" }, 401);
  // Bound actual streamed bytes, not just the caller-controlled Content-Length.
  const raw = await readBody(request);
  if (raw instanceof NextResponse) return raw;
  if (
    !isRecord(raw) ||
    Object.keys(raw).some(
      (key) =>
        !["tenantId", "quoteId", "clientOrderId", "tender"].includes(key),
    ) ||
    !isUuid(raw.tenantId) ||
    !isUuid(raw.quoteId) ||
    typeof raw.clientOrderId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(raw.clientOrderId)
  ) {
    return respond(
      {
        error:
          "A tenant, quote, stable client order ID and tender are required.",
      },
      400,
    );
  }
  const body = {
    tenantId: raw.tenantId.toLowerCase(),
    quoteId: raw.quoteId.toLowerCase(),
    clientOrderId: raw.clientOrderId,
    tender: raw.tender,
  };
  try {
    const caller = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: authorization } },
      },
    );
    const {
      data: { user },
      error: authError,
    } = await caller.auth.getUser();
    if (authError || !user) return respond({ error: "Unauthorized" }, 401);
    const { data: member, error: memberError } = await caller
      .from("app_users")
      .select("role, tenant_id, permissions, is_owner")
      .eq("user_id", user.id)
      .single();
    if (
      memberError ||
      !member ||
      !(
        member.role === "superadmin" ||
        (member.role === "admin" && member.tenant_id === body.tenantId)
      ) ||
      !hasPermission(member, "pos") ||
      !hasPermission(member, "loyalty_redeem")
    ) {
      return respond({ error: "Forbidden" }, 403);
    }
    // New migrations precede generated Database types. Runtime rows are checked below.
    const admin: SupabaseClient = createAdminClient();
    const { data: quote, error: quoteError } = await admin
      .from("loyalty_pos_quotes")
      .select("total_centavos, order_snapshot")
      .eq("id", body.quoteId)
      .eq("tenant_id", body.tenantId)
      .eq("created_by", user.id)
      .maybeSingle();
    if (quoteError) return unavailable();
    if (!quote) return respond({ error: "Quote not found." }, 404);
    const policy: unknown = isRecord(quote.order_snapshot)
      ? quote.order_snapshot.paymentPolicy
      : null;
    if (
      !isRecord(policy) ||
      !Number.isSafeInteger(quote.total_centavos) ||
      policy.totalCentavos !== quote.total_centavos
    ) {
      return invalidPolicy();
    }
    const payment = validateTender(policy, body.tender);
    if (!payment.ok && payment.error === "invalid_policy")
      return invalidPolicy();
    if (!payment.ok) return respond({ error: payment.error }, 422);
    if (process.env.LOYALTY_POS_SETTLEMENT_ENABLED !== "true") {
      // Turning off new redemptions must not hide an already committed receipt.
      const { data: receipt, error: recoveryError } = await admin
        .from("loyalty_pos_settlements")
        .select(
          "id,quote_id,cashier_id,client_order_id,total_centavos,settled_at,payment",
        )
        .eq("tenant_id", body.tenantId)
        .eq("client_order_id", body.clientOrderId)
        .maybeSingle();
      if (recoveryError) return unavailable();
      if (!receipt)
        return respond(
          { error: "Loyalty settlement is not available yet." },
          503,
        );
      if (
        receipt.quote_id !== body.quoteId ||
        receipt.cashier_id !== user.id ||
        !isDeepStrictEqual(receipt.payment, payment.value)
      ) {
        return respond(
          { error: "Idempotency key belongs to a different request" },
          409,
        );
      }
      return respond(
        {
          success: true,
          receipt: {
            settlementId: receipt.id,
            clientOrderId: receipt.client_order_id,
            totalCentavos: receipt.total_centavos,
            settledAt: receipt.settled_at,
          },
        },
        200,
      );
    }
    const { data, error } = await admin.rpc("settle_loyalty_pos_sale", {
      p_tenant_id: body.tenantId,
      p_quote_id: body.quoteId,
      p_client_order_id: body.clientOrderId,
      p_actor: user.id,
      p_payment: payment.value,
    });
    if (error) return settlementError(error.message);
    if (!data) return unavailable();
    return respond({ success: true, receipt: data }, 200);
  } catch {
    // Do not log request bodies, tender references, access tokens or DB messages.
    // A transport failure may follow a commit: retry the SAME client order ID.
    return unavailable();
  }
}

function invalidPolicy(): NextResponse {
  return respond(
    { error: "Quote payment policy is unavailable. Request a new quote." },
    409,
  );
}

/** Only known business errors may leave the database boundary. */
function settlementError(message: string): NextResponse {
  if (message === "Forbidden branch" || message === "Forbidden")
    return respond({ error: "Forbidden" }, 403);
  const conflicts = [
    "Idempotency key belongs to a different request",
    "Quote already settled",
    "Quote expired",
    "Live loyalty is not enabled",
    "Reward reservation expired or unavailable",
    "Reservation does not match quote",
    "Reward is not valid at this branch",
  ];
  if (conflicts.includes(message)) return respond({ error: message }, 409);
  if (
    ["Quote not found", "Reservation not found", "Reward not found"].includes(
      message,
    )
  ) {
    return respond({ error: "Quote or reservation not found." }, 404);
  }
  return unavailable();
}

function unavailable(): NextResponse {
  return respond(
    {
      error:
        "Settlement could not be confirmed. Retry with the same client order ID.",
    },
    503,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

async function readBody(request: NextRequest): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return respond({ error: "JSON body is required." }, 400);
  let bytes = 0;
  let text = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 16384) {
        await reader.cancel();
        return respond({ error: "Request is too large." }, 413);
      }
      text += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch {
    return respond({ error: "Invalid JSON body." }, 400);
  } finally {
    reader.releaseLock();
  }
}

function respond(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
