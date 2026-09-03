// Reads and writes for platform "What's New" on the phone.
//
// Announcements live on the platform Supabase project for every store,
// whatever serves their orders, so — like customers — this needs no backend
// routing: one client, three tables, all tenants. RLS hands a merchant only
// published rows aimed at everyone or at their store, and only their own
// read receipts and device tokens. A failure throws; resolving to [] on
// error would render a broken query as "nothing new".

import { Platform } from "react-native";
import { supabase } from "../supabase";
import { parseAnnouncementBlocks, type AnnouncementBlock, type AnnouncementKind } from "./blocks";

export interface Announcement {
  id: string;
  kind: AnnouncementKind;
  title: string;
  summary: string | null;
  coverImageUrl: string | null;
  blocks: AnnouncementBlock[];
  /** True when the stored body failed validation; the screen says so. */
  isBodyUnreadable: boolean;
  showPopup: boolean;
  publishedAt: string;
}

interface AnnouncementRow {
  id: string;
  kind: string;
  title: string;
  summary: string | null;
  cover_image_url: string | null;
  blocks: unknown;
  show_popup: boolean;
  published_at: string | null;
}

const COLUMNS = "id, kind, title, summary, cover_image_url, blocks, show_popup, published_at";
const MAX_LIST = 100;

function toAnnouncement(row: AnnouncementRow): Announcement {
  const parsed = parseAnnouncementBlocks(row.blocks);
  return {
    id: row.id,
    kind: row.kind === "notice" ? "notice" : "post",
    title: row.title,
    summary: row.summary,
    coverImageUrl: row.cover_image_url,
    blocks: parsed.ok ? parsed.blocks : [],
    isBodyUnreadable: !parsed.ok,
    showPopup: row.show_popup,
    publishedAt: row.published_at ?? "",
  };
}

/** Every published announcement this account may see, newest first. */
export async function listAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from("platform_announcements")
    .select(COLUMNS)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) throw new Error(error.message);
  return ((data ?? []) as AnnouncementRow[]).map(toAnnouncement);
}

export async function fetchAnnouncement(id: string): Promise<Announcement | null> {
  const { data, error } = await supabase
    .from("platform_announcements")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toAnnouncement(data as AnnouncementRow) : null;
}

/** Ids of the announcements this account has already opened. */
export async function listReadAnnouncementIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("platform_announcement_reads")
    .select("announcement_id")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => row.announcement_id as string));
}

export async function markAnnouncementRead(announcementId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("platform_announcement_reads")
    .upsert(
      { announcement_id: announcementId, user_id: userId },
      { onConflict: "announcement_id,user_id", ignoreDuplicates: true }
    );
  if (error) throw new Error(error.message);
}

/** Files this device's token for platform pushes; the row is keyed by token. */
export async function upsertPlatformDeviceToken(input: {
  token: string;
  userId: string;
  tenantId: string | null;
}): Promise<void> {
  const { error } = await supabase.from("platform_device_tokens").upsert(
    {
      token: input.token,
      user_id: input.userId,
      tenant_id: input.tenantId,
      platform: Platform.OS === "ios" ? "ios" : "android",
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "token" }
  );
  if (error) throw new Error(error.message);
}
