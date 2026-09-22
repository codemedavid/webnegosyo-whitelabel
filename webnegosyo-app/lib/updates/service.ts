// Reads the platform's published release policy for THIS device's store.
//
// One row per store platform on the platform Supabase project, like
// announcements: the policy is platform-wide, not per-tenant, so no backend
// routing is involved. RLS grants every signed-in account read access.

import { Platform } from "react-native";
import { supabase } from "../supabase";
import { parseAppRelease, type AppRelease } from "./gate";

const COLUMNS = "latest_version, minimum_version, store_url, release_notes";

/** The device's own store platform, or null on a platform with no store. */
export function currentStorePlatform(): "ios" | "android" | null {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return null;
}

/**
 * The release policy for this device, or null when none is published or the
 * read fails. Null means "say nothing", which is the safe outcome: a database
 * hiccup must never present itself as a locked register.
 */
export async function fetchAppRelease(): Promise<AppRelease | null> {
  const platform = currentStorePlatform();
  if (!platform) return null;

  const { data, error } = await supabase
    .from("platform_app_releases")
    .select(COLUMNS)
    .eq("platform", platform)
    .maybeSingle();

  if (error || !data) return null;
  return parseAppRelease(data);
}
