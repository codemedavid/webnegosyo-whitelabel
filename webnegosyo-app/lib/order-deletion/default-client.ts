/**
 * The order-deletion client wired to the real web app and the signed-in
 * owner's session. Kept apart from client.ts so tests never load Supabase.
 */
import { getAccessTokenBounded } from "../authorized-post";
import { getWebAppUrl } from "../web-app-url";
import { createOrderDeletionClient } from "./client";

const TOKEN_TIMEOUT_MS = 8_000;

export const orderDeletionClient = createOrderDeletionClient({
  baseUrl: getWebAppUrl(),
  getToken: () => getAccessTokenBounded(TOKEN_TIMEOUT_MS),
});
