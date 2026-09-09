/**
 * Turning the backend's channel counts into a row a merchant can read.
 *
 * The backend reports raw `orders.source` keys — "pos", "qr_handoff" — and a
 * count each. This gives them the names used everywhere else in the app, a
 * share of the period, and a defined answer for the two cases the merchant
 * would otherwise see as a gap: an order that recorded no channel, and a store
 * whose Convex deployment predates the split and still sends only web/mobile.
 */

/** The channels the platform writes, named as the rest of the app names them. */
export const ORDER_SOURCE_LABELS: Record<string, string> = {
  web: "Online",
  mobile: "App",
  pos: "Counter",
  qr_handoff: "QR",
  manual: "Manual",
};

const UNRECORDED_LABEL = "Other";

export interface OrderChannelCounts {
  source: string;
  count: number;
  revenue: number;
}

export interface OrderChannelRow {
  source: string;
  label: string;
  count: number;
  /** null when the backend reported counts without revenue (older deployment). */
  revenue: number | null;
  /** Share of every order in the period, 0..1. */
  share: number;
}

export interface OrderChannelSource {
  totalOrders: number;
  ordersByChannel?: readonly OrderChannelCounts[] | null;
  ordersBySource?: { web: number; mobile: number } | null;
}

/** "kiosk_terminal" -> "Kiosk terminal", so an unmapped channel still reads. */
function labelFor(source: string): string {
  if (!source) return UNRECORDED_LABEL;
  const known = ORDER_SOURCE_LABELS[source];
  if (known) return known;
  const words = source.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function shareOf(count: number, totalOrders: number): number {
  return totalOrders > 0 ? count / totalOrders : 0;
}

/**
 * A store on a backend that predates the split. Reporting only what that
 * backend actually knows is better than showing a total that does not add up,
 * so the two channels appear and their revenue stays unknown rather than 0.
 */
function fallbackRows(input: OrderChannelSource): OrderChannelRow[] {
  const { web = 0, mobile = 0 } = input.ordersBySource ?? {};
  return [
    { source: "web", count: web },
    { source: "mobile", count: mobile },
  ]
    .filter((row) => row.count > 0)
    .map((row) => ({
      ...row,
      label: labelFor(row.source),
      revenue: null,
      share: shareOf(row.count, input.totalOrders),
    }))
    .sort((a, b) => b.count - a.count);
}

export function buildOrderChannelRows(input: OrderChannelSource): OrderChannelRow[] {
  if (!input.ordersByChannel) return fallbackRows(input);

  return input.ordersByChannel
    .filter((channel) => channel.count > 0)
    .map((channel) => ({
      source: channel.source,
      label: labelFor(channel.source),
      count: channel.count,
      revenue: channel.revenue,
      share: shareOf(channel.count, input.totalOrders),
    }))
    .sort((a, b) => b.count - a.count);
}
