/**
 * The merchant app's App Store screenshots, shown in the `/download`
 * page's Preview rail. They are the same artwork as the listing, saved at
 * half size (645 × 1398) as WebP in `public/download/screens/`.
 */

export interface AppScreen {
  src: string;
  alt: string;
}

export const APP_SCREEN_SIZE = { width: 645, height: 1398 } as const;

export const APP_SCREENS: readonly AppScreen[] = [
  {
    src: "/download/screens/01-hero.webp",
    alt: "Run your whole restaurant from one phone: today's sales and live orders on the home screen",
  },
  {
    src: "/download/screens/02-orders.webp",
    alt: "Never miss an order: a loud ring for every new order, then accept it in one tap",
  },
  {
    src: "/download/screens/03-register.webp",
    alt: "Ring up a sale in 3 taps: the built-in register prints to your Bluetooth printer",
  },
  {
    src: "/download/screens/04-bill-split.webp",
    alt: "Split the bill with zero math: evenly, or tap who had what",
  },
  {
    src: "/download/screens/05-owl.webp",
    alt: "Just ask Owl: your AI assistant answers sales questions and suggests promos you confirm",
  },
  {
    src: "/download/screens/06-reports.webp",
    alt: "Know who keeps coming back: regulars, first-timers and favourites in Reports",
  },
  {
    src: "/download/screens/07-loyalty.webp",
    alt: "Stamp cards in their wallet: Apple Wallet and Google Wallet loyalty passes",
  },
  {
    src: "/download/screens/08-everything.webp",
    alt: "Everything your store needs: kitchen display, stock alerts, receipts, vouchers, delivery and branches",
  },
];
