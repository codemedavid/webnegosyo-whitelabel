/**
 * The owner's chosen Overview cards, kept per person and per store on this
 * device. (Plan §5.5 moves this to `report_preferences` so the choice follows
 * the owner to the web; until the web has "Edit cards" too, the phone is the
 * only place it is made.) A storage failure reads as "not chosen yet".
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { MetricId } from "./types";

const STORAGE_PREFIX = "sales-report.cards.v1";

export function cardPrefsKey(userId: string, tenantId: string): string {
  return `${STORAGE_PREFIX}:${userId}:${tenantId}`;
}

export async function readCardPrefs(userId: string, tenantId: string): Promise<MetricId[] | null> {
  try {
    const raw = await AsyncStorage.getItem(cardPrefsKey(userId, tenantId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === "string") ? (parsed as MetricId[]) : null;
  } catch {
    return null;
  }
}

export async function writeCardPrefs(userId: string, tenantId: string, cards: readonly MetricId[]): Promise<void> {
  try {
    await AsyncStorage.setItem(cardPrefsKey(userId, tenantId), JSON.stringify(cards));
  } catch {
    // Not saved: the cards still change for this visit.
  }
}
