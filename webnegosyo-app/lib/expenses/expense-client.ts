/**
 * The signed-in user's Supabase session as the expense service's client.
 *
 * Kept apart from `expense-service.ts` so logic tests never load the live
 * client (it reaches `expo-constants` and AsyncStorage). The RPCs and RLS run
 * as the caller, so the app never needs a privileged path.
 */

import { supabase } from "../supabase";
import type { ExpenseDb } from "./expense-service";

export const liveExpenseDb: ExpenseDb = {
  from: (table) => supabase.from(table),
  rpc: (fn, args) => supabase.rpc(fn, args),
};
