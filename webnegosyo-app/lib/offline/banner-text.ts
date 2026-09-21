/**
 * The one line the register shows about its connection and queued sales.
 * Pure, so the wording is tested without rendering.
 */

export interface BannerCounts {
  pending: number;
  stuck: number;
}

function sales(count: number): string {
  return `${count} ${count === 1 ? "sale" : "sales"}`;
}

export function offlineBannerText(status: string, counts: BannerCounts): string | null {
  const parts: string[] = [];
  if (status === "offline") {
    parts.push(
      counts.pending > 0
        ? `Offline — ${sales(counts.pending)} saved on this device`
        : "Offline — sales are saved on this device and sync when you're back online"
    );
  } else if (counts.pending > 0) {
    parts.push(`Back online — syncing ${sales(counts.pending)}…`);
  }
  if (counts.stuck > 0) {
    parts.push(`${sales(counts.stuck)} could not sync — check the order list`);
  }
  return parts.length === 0 ? null : parts.join(" · ");
}
