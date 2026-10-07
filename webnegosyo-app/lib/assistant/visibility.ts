/**
 * When the floating owl appears.
 *
 * Mirrors the web's mount rule (admin-layout-client.tsx): the store has the
 * assistant switched on, and the account is store-wide — a branch-locked
 * account is refused by the server, so it is not offered a button that only
 * says no. Demo mode has no real session to ask with.
 *
 * The web hides the owl on its full-bleed studios; the app's equivalents are
 * the shift screens where a floating button would sit on top of the work
 * (the register and its tender, the kitchen board, the scanner, the receipt
 * editor) and every detail / editor screen (a `[param]` route), whose Save
 * bar sits exactly where the owl floats.
 */

export interface OwlVisibilityInput {
  isAuthenticated: boolean;
  isDemo: boolean;
  tenantId: string | null;
  assistantEnabled: boolean;
  /** Set for a branch-locked account. */
  outletId: string | null;
  /** The focused route's segments, e.g. ["(main)", "product", "[productId]"]. */
  routeSegments: readonly string[];
}

export const OWL_HIDDEN_ROUTES: ReadonlySet<string> = new Set([
  "pos",
  "pos-tender",
  "pos-loyalty",
  "kitchen",
  "scan",
  "receipt-editor",
  "tutorial",
]);

export function isOwlAvailable(input: Omit<OwlVisibilityInput, "routeSegments">): boolean {
  return input.isAuthenticated && !input.isDemo && input.tenantId !== null && input.assistantEnabled && input.outletId === null;
}

export function shouldShowOwlButton(input: OwlVisibilityInput): boolean {
  if (!isOwlAvailable(input)) return false;
  return !input.routeSegments.some((segment) => segment.startsWith("[") || OWL_HIDDEN_ROUTES.has(segment));
}
