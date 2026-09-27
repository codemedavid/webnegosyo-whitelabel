/**
 * Pure helpers for one guest's profile screen.
 *
 * No React, no Supabase: what the screen shows and where its buttons go is
 * decided here, so it can be tested without a handset.
 */

export interface TopItem {
  name: string;
  quantity: number;
}

/** How many favourites the profile lists. The column holds a top-N already. */
export const MAX_TOP_ITEMS = 5;

/**
 * `customers.top_items` is jsonb written by the order roll-up. It is trusted to
 * be an array of `{ name, quantity }`, but a row written by an older roll-up —
 * or hand-edited — must not crash the screen, so anything off-shape is dropped.
 */
export function parseTopItems(value: unknown): TopItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is { name: string; quantity: unknown } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { name?: unknown }).name === "string" &&
        (item as { name: string }).name.trim() !== ""
    )
    .map((item) => ({
      name: item.name.trim(),
      quantity: Math.max(0, Math.round(Number(item.quantity) || 0)),
    }))
    .slice(0, MAX_TOP_ITEMS);
}

export interface ContactLinks {
  call: string | null;
  text: string | null;
  email: string | null;
}

/** `tel:` / `sms:` / `mailto:` targets, or null where the guest left nothing. */
export function contactLinksFor(
  phoneE164: string | null,
  email: string | null
): ContactLinks {
  const phone = phoneE164?.trim() || null;
  const address = email?.trim() || null;
  return {
    call: phone ? `tel:${phone}` : null,
    text: phone ? `sms:${phone}` : null,
    email: address ? `mailto:${address}` : null,
  };
}

/**
 * The loyalty identity key for this guest, e.g. `phone:+639171234567`.
 *
 * Mirrors `src/lib/customer-identity.ts`: phone first, email as the fallback.
 * Null when the guest has neither, since nothing can be looked up by a name.
 */
export function loyaltyKeyFor(phoneE164: string | null, email: string | null): string | null {
  const phone = phoneE164?.trim();
  if (phone) return `phone:${phone}`;
  const address = email?.trim().toLowerCase();
  return address ? `email:${address}` : null;
}

/** The name a guest goes by on screen. Blank names are common on POS captures. */
export function displayNameOf(name: string | null | undefined): string {
  return name?.trim() || "Unnamed guest";
}

/**
 * Order-type names as the store spelled them, de-duplicated case-insensitively.
 *
 * `channels_used` holds each store's own order-type labels ("Pick Up",
 * "Delivery (+20 for delivery fee)"), not a fixed enum, so they are shown as
 * written — renaming them here would put words in the merchant's mouth.
 */
export function distinctChannels(channels: readonly string[]): string[] {
  const seen = new Set<string>();
  return channels.reduce<string[]>((kept, raw) => {
    const label = raw.trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) return kept;
    seen.add(key);
    return [...kept, label];
  }, []);
}
