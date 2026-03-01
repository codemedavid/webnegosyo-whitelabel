import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Lalamove webhook payload fields
    const {
      orderId: lalamoveOrderId,
      status,
      driverName,
      driverPhone,
      shareLink,
    } = body;

    // Tenant ID passed as query param (set when configuring webhook URL)
    const tenantId = request.nextUrl.searchParams.get("tenant_id");
    const convexOrderId = request.nextUrl.searchParams.get("order_id");

    if (!tenantId || !convexOrderId) {
      return NextResponse.json(
        { error: "Missing tenant_id or order_id query parameter" },
        { status: 400 }
      );
    }

    // Fetch tenant's Convex credentials
    const supabase = createAdminClient();
    const { data: tenant, error } = await supabase
      .from("tenants")
      .select("convex_deployment_url, convex_deploy_key")
      .eq("id", tenantId)
      .single();

    if (error || !tenant?.convex_deployment_url || !tenant?.convex_deploy_key) {
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
          path: "orders:updateLalamoveDetails",
          args: {
            orderId: convexOrderId,
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

    if (convexResult.status === "error") {
      return NextResponse.json(
        { error: convexResult.errorMessage },
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
