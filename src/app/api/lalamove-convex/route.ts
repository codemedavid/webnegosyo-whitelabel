import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantSecrets } from "@/lib/tenant-secrets";

export async function POST(request: NextRequest) {
  try {
    // Validate webhook secret to prevent unauthorized access
    const webhookSecret = request.nextUrl.searchParams.get("secret");
    const expectedSecret = process.env.LALAMOVE_WEBHOOK_SECRET;
    if (!expectedSecret || webhookSecret !== expectedSecret) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
    }

    // Lalamove webhook payload fields
    const {
      orderId: lalamoveOrderId,
      status,
      driverName,
      driverPhone,
      shareLink,
    } = body;

    if (typeof lalamoveOrderId !== "string" || !lalamoveOrderId.trim() ||
      typeof status !== "string" || !status.trim()) {
      return NextResponse.json(
        { error: "A provider orderId and status are required" },
        { status: 400 }
      );
    }

    // Tenant ID passed as query param (set when configuring webhook URL)
    const tenantId = request.nextUrl.searchParams.get("tenant_id");
    const convexOrderId = request.nextUrl.searchParams.get("order_id");

    if (!tenantId || !convexOrderId) {
      return NextResponse.json(
        { error: "Missing tenant_id or order_id query parameter" },
        { status: 400 }
      );
    }

    // Validate tenant_id is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(tenantId)) {
      return NextResponse.json(
        { error: "Invalid tenant_id format" },
        { status: 400 }
      );
    }

    // Fetch tenant's Convex credentials
    const supabase = createAdminClient();
    const { data: tenantData, error } = await supabase
      .from("tenants")
      .select("convex_deployment_url")
      .eq("id", tenantId)
      .single();

    const deployKey = error ? null : (await getTenantSecrets(supabase, tenantId))?.convex_deploy_key;
    const tenant = tenantData
      ? { ...(tenantData as { convex_deployment_url: string | null }), convex_deploy_key: deployKey ?? null }
      : null;

    if (error || !tenant?.convex_deployment_url || !tenant.convex_deploy_key) {
      return NextResponse.json(
        { error: "Tenant not found or Convex not configured" },
        { status: 404 }
      );
    }

    // Update the order in Convex via HTTP API
    const convexResponse = await fetch(
      `${tenant.convex_deployment_url}/api/mutation`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Convex ${tenant.convex_deploy_key}`,
        },
        body: JSON.stringify({
          path: "orders:updateLalamoveDetailsInternal",
          args: {
            orderId: convexOrderId,
            expectedLalamoveOrderId: lalamoveOrderId,
            lalamoveOrderId: lalamoveOrderId,
            lalamoveStatus: status,
            lalamoveDriverName: driverName,
            lalamoveDriverPhone: driverPhone,
            lalamoveTrackingUrl: shareLink,
          },
          format: "json",
        }),
      }
    );

    const convexResult = await convexResponse.json();

    if (!convexResponse.ok || convexResult.status !== "success") {
      return NextResponse.json(
        { error: convexResult.errorMessage ?? "Could not apply the delivery webhook update" },
        { status: 500 }
      );
    }

    if (convexResult.value === false) {
      return NextResponse.json(
        { error: "The delivery booking changed or is awaiting confirmation; webhook update was not applied" },
        { status: 409 }
      );
    }

    if (convexResult.value !== true) {
      return NextResponse.json(
        { error: "Delivery webhook update was not confirmed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Lalamove Convex webhook error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
