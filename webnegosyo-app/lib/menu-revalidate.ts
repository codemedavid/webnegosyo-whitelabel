import { getWebAppUrl } from "./web-app-url";
import { supabase } from "./supabase";


/**
 * Fire-and-forget: ask the web app to revalidate the public menu ISR cache
 * after a mobile-side write. Mobile writes bypass Next.js revalidation, so
 * without this the public menu can lag up to the ISR TTL. Never throws —
 * a failure here should not block the mobile mutation that already succeeded.
 */
export async function notifyMenuRevalidate(
  tenantId: string,
  tenantSlug: string
): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    await fetch(`${getWebAppUrl()}/api/revalidate-menu`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ tenantId, tenantSlug }),
    });
  } catch {
    // Best-effort — the mutation already succeeded, ISR TTL is the fallback.
  }
}
