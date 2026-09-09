// What the Team screen sends when one permission switch is flipped.
//
// A staff row with `permissions: null` means full access (owners, and admins
// created before staff management existed). The screen renders every switch
// on for such a row, so the edit the owner sees is "all of them, minus this
// one" — and that is what must be sent. Sending only the toggled key would
// silently revoke everything else. Pure, so the derivation is testable.

import { STAFF_PERMISSION_KEYS } from "./staff-permissions";

/** The grants a row actually holds, with null expanded to the full registry. */
export function effectivePermissions(permissions: readonly string[] | null): string[] {
  return permissions === null ? [...STAFF_PERMISSION_KEYS] : [...permissions];
}

/** A new list with `key` added if absent, or removed if held. */
export function togglePermission(list: readonly string[], key: string): string[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

/** The full list to send after flipping `key` on a row that may be full-access. */
export function toggleEffectivePermission(
  permissions: readonly string[] | null,
  key: string,
): string[] {
  return togglePermission(effectivePermissions(permissions), key);
}
