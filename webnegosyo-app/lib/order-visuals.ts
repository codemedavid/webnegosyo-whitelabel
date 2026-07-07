// Shared presentational helpers for order cards and detail views. Pure
// functions only (no React, no Convex) so they are unit-tested under the
// lib/ Jest root and reused across the dashboard and orders screens.
import { colors } from "../theme/colors";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "delivered"
  | "cancelled";

export type Urgency = "fresh" | "warning" | "urgent";

const FRESH_MAX_MINUTES = 5;
const WARNING_MAX_MINUTES = 15;

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/** Two-letter avatar initials from a customer/product name. */
export function getInitials(name: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  const first = words[0][0];
  const last = words[words.length - 1][0];
  return (first + last).toUpperCase();
}

/** Deterministic avatar color so the same customer always gets the same hue. */
export function getAvatarColor(seed: string): string {
  const palette = colors.avatarPalette;
  if (!seed) return palette[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash + seed.charCodeAt(i)) % palette.length;
  }
  return palette[hash];
}

/** Age bucket of an active order, driving the card's urgency accent. */
export function getUrgency(creationTimeMs: number, nowMs: number = Date.now()): Urgency {
  const elapsed = nowMs - creationTimeMs;
  if (!Number.isFinite(elapsed) || elapsed < 0) return "fresh";
  const minutes = elapsed / MS_PER_MINUTE;
  if (minutes < FRESH_MAX_MINUTES) return "fresh";
  if (minutes < WARNING_MAX_MINUTES) return "warning";
  return "urgent";
}

export function getUrgencyColor(urgency: Urgency): string {
  switch (urgency) {
    case "warning":
      return colors.urgencyWarning;
    case "urgent":
      return colors.urgencyUrgent;
    default:
      return colors.urgencyFresh;
  }
}

interface OrderTypeMeta {
  label: string;
}

function titleCase(value: string): string {
  return value
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Human label for an order fulfillment type (delivery/pickup/dine-in).
 * Typography-only — the editorial theme renders the label as an uppercase
 * micro-chip rather than an emoji glyph.
 */
export function getOrderTypeMeta(type?: string): OrderTypeMeta {
  const normalized = (type ?? "").toLowerCase();
  if (!normalized.trim()) return { label: "Order" };
  if (normalized.includes("deliver")) return { label: "Delivery" };
  if (normalized.includes("pick")) return { label: "Pickup" };
  if (normalized.includes("dine")) return { label: "Dine-in" };
  return { label: titleCase(type as string) };
}

interface StatusMeta {
  label: string;
  bg: string;
  text: string;
}

const STATUS_PALETTE: Record<OrderStatus, { bg: string; text: string }> = {
  pending: colors.statusPending,
  confirmed: colors.statusConfirmed,
  preparing: colors.statusPreparing,
  ready: colors.statusReady,
  delivered: colors.statusDelivered,
  cancelled: colors.statusCancelled,
};

/** Pill colors + capitalized label for an order status. */
export function getStatusMeta(status: string): StatusMeta {
  const pair = STATUS_PALETTE[status as OrderStatus];
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  if (!pair) {
    return { label, bg: colors.separator, text: colors.textSecondary };
  }
  return { label, bg: pair.bg, text: pair.text };
}

/** Compact relative time ("Just now", "5m ago", "3h ago", "2d ago"). */
export function formatTimeAgo(timestampMs: number, nowMs: number = Date.now()): string {
  const diff = nowMs - timestampMs;
  const minutes = Math.floor(diff / MS_PER_MINUTE);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(diff / MS_PER_HOUR);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(diff / MS_PER_DAY)}d ago`;
}
