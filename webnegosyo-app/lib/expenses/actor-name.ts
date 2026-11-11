/**
 * The name stamped on an expense ("Drawer · Ana · 9:42 AM"), read from the
 * session the same way the shift card names a shift. Bounded: a stalled token
 * refresh must never hold up a save, so it falls back rather than waiting.
 */

import { withDeadline } from "../offline/deadline";
import { supabase } from "../supabase";

const SESSION_READ_MS = 4_000;

export async function readActorName(): Promise<string> {
  try {
    const { data } = await withDeadline(supabase.auth.getSession(), SESSION_READ_MS);
    const user = data.session?.user;
    const name = (user?.user_metadata?.display_name as string | undefined) || user?.email || "Staff";
    return name.slice(0, 80);
  } catch {
    return "Staff";
  }
}
