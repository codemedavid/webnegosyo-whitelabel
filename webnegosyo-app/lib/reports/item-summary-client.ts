/**
 * The item summary's live RPC client: the app's Supabase client, i.e. the
 * SIGNED-IN user's session — never the service role. Row-level security and
 * the report functions' `reports` check decide what comes back. Kept apart
 * from `item-summary.ts` so that module (and the slip built on it) stays pure.
 */

import { supabase } from "../supabase";
import type { ItemSummaryRpcClient } from "./item-summary";

export const liveItemSummaryClient: ItemSummaryRpcClient = {
  rpc: (fn, args, page) => {
    const call = supabase.rpc(fn, args);
    // Ordered by the item key so consecutive pages never repeat or skip a row.
    return page ? call.order("item_key", { ascending: true }).range(page.from, page.to) : call;
  },
};
