/**
 * The signed-in user's Supabase session as the chat reader.
 *
 * Kept apart from `./repo.ts` so the hooks' tests never import the live client.
 * The column list is exactly what `authenticated` is granted on
 * `messenger_sessions` (20261111224021): asking for the cart or checkout state
 * would fail the whole read, not just hide those columns.
 */

import { supabase } from "../supabase";
import type { ChatDb, DbResult } from "./repo";

const SESSION_COLUMNS =
  "id, psid, first_name, last_name, profile_pic_url, last_message_at, last_message_preview, last_inbound_at, bot_paused_until";
const MESSAGE_COLUMNS = "id, direction, kind, body, sent_at, sent_by";
const CHAT_ORDER_COLUMNS = "order_id, state, outcome, summary_sent_at, created_at";

export const platformChatDb: ChatDb = {
  sessionsByPsid: (tenantId, psids) =>
    supabase.from("messenger_sessions").select(SESSION_COLUMNS).eq("tenant_id", tenantId).in("psid", psids) as unknown as PromiseLike<DbResult>,

  sessionById: (sessionId) =>
    supabase.from("messenger_sessions").select(SESSION_COLUMNS).eq("id", sessionId).maybeSingle() as unknown as PromiseLike<DbResult>,

  messages: (sessionId, limit, beforeIso) => {
    const query = supabase.from("messenger_messages").select(MESSAGE_COLUMNS).eq("session_id", sessionId);
    const paged = beforeIso ? query.lt("sent_at", beforeIso) : query;
    return paged.order("sent_at", { ascending: false }).limit(limit) as unknown as PromiseLike<DbResult>;
  },

  chats: (tenantId, limit, beforeIso) =>
    supabase.rpc("messenger_chats", { p_tenant_id: tenantId, p_limit: limit, p_before: beforeIso }) as unknown as PromiseLike<DbResult>,

  chatOrders: (orderIds) =>
    supabase.from("messenger_chat_orders").select(CHAT_ORDER_COLUMNS).in("order_id", orderIds) as unknown as PromiseLike<DbResult>,
};
