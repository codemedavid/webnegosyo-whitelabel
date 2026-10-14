/**
 * The signed-in user's Supabase session as an activity RPC client.
 *
 * The RPCs run as the caller (auth.uid()) and decide visibility themselves,
 * so the app never needs a privileged path. Kept apart from the hooks so they
 * never import the live client (tests inject a fake).
 */

import { supabase } from "../supabase";
import type { ActivityRpcClient, RpcResult } from "./activity-repo";

export const platformActivityClient: ActivityRpcClient = {
  rpc: (fn, args) => supabase.rpc(fn, args) as unknown as PromiseLike<RpcResult>,
};
