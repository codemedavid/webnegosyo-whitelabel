/**
 * A reviewer opening an ID photo: a 60-second link from the web app, asked
 * for with the signed-in user's token. The server reads the photo's row as
 * this user, so RLS decides who may see it.
 */

import { getAccessTokenBounded } from "../authorized-post";
import { getWebAppUrl } from "../web-app-url";

const TIMEOUT_MS = 10_000;

export type IdPhotoLinkResult =
  | { status: "ok"; url: string }
  | { status: "error"; message: string };

export async function fetchIdPhotoLink(tenantId: string, photoId: string): Promise<IdPhotoLinkResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, TIMEOUT_MS);
  });
  try {
    const token = await Promise.race([getAccessTokenBounded(TIMEOUT_MS), expiry]);
    if (!token) return { status: "error", message: "Sign in again to view this photo." };
    const response = await Promise.race([
      fetch(`${getWebAppUrl()}/api/gov-discounts/id-photos/link`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenantId, photoId }),
      }),
      expiry,
    ]);
    const json = (await response.json().catch(() => ({}))) as { url?: unknown; error?: unknown };
    if (response.ok && typeof json.url === "string") return { status: "ok", url: json.url };
    return {
      status: "error",
      message: typeof json.error === "string" && json.error ? json.error : "Could not open the photo. Try again.",
    };
  } catch {
    return { status: "error", message: "No connection. Try again when you are online." };
  } finally {
    clearTimeout(timer);
  }
}
