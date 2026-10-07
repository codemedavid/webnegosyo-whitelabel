/**
 * The speech bubble beside the floating owl.
 *
 * A round owl on its own does not say what it does, so owners never tapped it.
 * The bubble names what Owl can do on the screen the owner is on and offers
 * one real question; tapping it opens Owl and asks that question.
 *
 * It is an introduction, not a permanent fixture: each screen's hint shows at
 * most once per app session, and the bubble retires for good once the owner
 * has opened Owl a few times or hid the tips.
 */

export interface OwlHint {
  /** What Owl can do here, in a few words. */
  title: string;
  /** A question Owl answers well; tapping the bubble sends it. */
  prompt: string;
}

/** Opens after which the owner knows the owl and the tips stop. */
export const OWL_HINT_INTRO_OPENS = 3;

/** Shown on Home and on any screen without a hint of its own. */
export const HOME_HINT: OwlHint = {
  title: "I can read your sales, menu and customers",
  prompt: "How were sales this week?",
};

/** Keyed by the focused route segment (the screen's file name under app/(main)). */
export const OWL_SCREEN_HINTS: Readonly<Record<string, OwlHint>> = {
  orders: { title: "I can tell you when you’re busiest", prompt: "When am I busiest?" },
  scheduled: { title: "I can tell you when you’re busiest", prompt: "When am I busiest?" },
  reports: { title: "I can explain your numbers", prompt: "How were sales this week?" },
  analytics: { title: "I can explain your numbers", prompt: "How were sales this week?" },
  trends: { title: "I can explain your numbers", prompt: "How were sales this week?" },
  "daily-report": { title: "I can explain your numbers", prompt: "How were sales this week?" },
  "product-analytics": { title: "I can spot dishes to push or drop", prompt: "Which dishes aren’t selling?" },
  menu: { title: "I can spot dishes to push or drop", prompt: "What are my hidden gems?" },
  "product-management": { title: "I can spot dishes to push or drop", prompt: "Which dishes aren’t selling?" },
  categories: { title: "I can spot dishes to push or drop", prompt: "What are my hidden gems?" },
  inventory: { title: "I can watch your stock", prompt: "What stock is running low?" },
  customers: { title: "I can find your best customers", prompt: "Who are my best customers?" },
  loyalty: { title: "I can find your best customers", prompt: "Who are my best customers?" },
  growth: { title: "I can draft promos and SMS for you", prompt: "Suggest a promo for my quiet hours" },
  vouchers: { title: "I can draft promos and vouchers", prompt: "Can I afford 20% off my best seller?" },
  team: { title: "I can check how your team is doing", prompt: "How is my staff doing this week?" },
};

/** The focused screen's key; the route group alone (`(main)`) is Home. */
export function screenKeyOf(routeSegments: readonly string[]): string {
  const screens = routeSegments.filter((segment) => !segment.startsWith("("));
  return screens[screens.length - 1] ?? "dashboard";
}

export function hintForRoute(routeSegments: readonly string[]): OwlHint {
  const key = screenKeyOf(routeSegments);
  return Object.prototype.hasOwnProperty.call(OWL_SCREEN_HINTS, key) ? OWL_SCREEN_HINTS[key] : HOME_HINT;
}

export interface OwlHintState {
  /** False until the saved state is read, so a hidden tip never flashes on launch. */
  isLoaded: boolean;
  isDismissed: boolean;
  /** How many times the owner has opened Owl on this device. */
  opens: number;
  /** Screens whose hint already showed this app session. */
  seenScreens: ReadonlySet<string>;
  screenKey: string;
}

export function shouldOfferOwlHint(state: OwlHintState): boolean {
  if (!state.isLoaded || state.isDismissed) return false;
  if (state.opens >= OWL_HINT_INTRO_OPENS) return false;
  return !state.seenScreens.has(state.screenKey);
}
