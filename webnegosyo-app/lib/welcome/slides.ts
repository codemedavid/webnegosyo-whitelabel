/**
 * The signed-out welcome screen (app/(auth)/welcome.tsx): three screens, each
 * one result a merchant gets from the app, shown before anyone logs in. The
 * copy never offers a sign-up — stores are set up on the web after payment,
 * so the app exposes only Log in and the demo (Apple 3.1.1, see
 * lib/app-store-compliance.test.ts).
 */

export type WelcomeSlideId = "orders" | "loyalty" | "sales";

export interface WelcomeSlide {
  id: WelcomeSlideId;
  panelColor: string;
  headline: string;
  body: string;
}

/** SmartMenu brand colours from the mascot reference sheet. */
export const WELCOME_COLORS = {
  red: "#E50914",
  yellow: "#FFA400",
  ink: "#1A1A1A",
  canvas: "#F7F7F7",
  muted: "#5C5C5C",
} as const;

export const WELCOME_SLIDES: readonly WelcomeSlide[] = [
  {
    id: "orders",
    panelColor: WELCOME_COLORS.red,
    headline: "Never miss\nan order again.",
    body: "Online, QR and counter orders land in one place, the moment they’re placed.",
  },
  {
    id: "loyalty",
    panelColor: WELCOME_COLORS.yellow,
    headline: "Turn first-timers\ninto suki.",
    body: "Stamp cards and friendly texts that bring your customers back.",
  },
  {
    id: "sales",
    panelColor: WELCOME_COLORS.ink,
    headline: "Know what sells.\nGrow what works.",
    body: "Sales, best sellers and busy hours for every branch, every day.",
  },
];

/** How long each screen stays before the next one plays. */
export const WELCOME_AUTOPLAY_MS = 5200;

/** A drag shorter than this is a tap or a wobble, not a swipe. */
export const SWIPE_THRESHOLD_PX = 40;

export function nextSlideIndex(index: number, count: number): number {
  return (index + 1) % count;
}

/** Swipes step one screen and stop at either end; autoplay is what wraps. */
export function slideIndexAfterSwipe(index: number, dx: number, count: number): number {
  if (dx <= -SWIPE_THRESHOLD_PX) return Math.min(index + 1, count - 1);
  if (dx >= SWIPE_THRESHOLD_PX) return Math.max(index - 1, 0);
  return index;
}
