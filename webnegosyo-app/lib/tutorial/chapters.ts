/**
 * The tutorial's chapter registry.
 *
 * Pure data: each chapter teaches one screen (or one workflow across a
 * couple), in the order a new merchant meets them — how to get around, the
 * first order, the register, then setup and insight. Every step names the
 * illustration it shows (`demo.kind` + `phase`); the components under
 * components/tutorial/demos/ draw them. Copy quotes the real screens' labels
 * so what the merchant reads here is what they will tap there.
 *
 * Which chapters an account sees is decided in visibility.ts, not here.
 */

import type { IconName } from "../../components/Icon";
import type { WorkspaceKey } from "../workspaces";

/** Which full-screen simulation a step plays, and which phase of it. */
export interface TutorialScene {
  kind: string;
  phase: string;
}

/** Where the coach card floats so it never covers the step's target. */
export type CoachPosition = "top" | "bottom";

export interface TutorialStep {
  id: string;
  title: string;
  /** What to do, in the product's own words. Two sentences at most. */
  body: string;
  /** The coach prompt over the illustration, e.g. "Tap Confirm to try it". */
  prompt?: string;
  /** What the merchant sees after doing it; shown once the step was tried. */
  result?: string;
  scene: TutorialScene;
  coach: CoachPosition;
}

export interface TutorialDestination {
  workspace: WorkspaceKey | null;
  href: string;
  label: string;
}

export interface TutorialChapter {
  id: string;
  title: string;
  tagline: string;
  icon: IconName;
  /** Tab whose reachability gates this chapter; null = every account. */
  gateTab: string | null;
  ownersOnly?: boolean;
  minutes: number;
  steps: readonly TutorialStep[];
  /** Where "Open it in the app" goes when the chapter is finished. */
  destination: TutorialDestination | null;
}

export const TUTORIAL_CHAPTERS: readonly TutorialChapter[] = [
  {
    id: "basics",
    title: "Getting around",
    tagline: "Five views, one map, and the shortcuts in every header",
    icon: "menu",
    gateTab: null,
    minutes: 2,
    destination: { workspace: null, href: "/(main)/menu", label: "Open the Menu" },
    steps: [
      {
        id: "views",
        title: "Five views, one app",
        body:
          "The app is split into focused views: Operations, POS, Insights, Products, and Business for multi-branch stores. The chip at the top of every screen names the one you are in.",
        prompt: "Tap the view chip, then choose POS",
        result:
          "The bottom bar now shows only the POS's tabs. Every view keeps its own, so the bar never gets crowded.",
        scene: { kind: "home", phase: "views" },
        coach: "bottom",
      },
      {
        id: "menu",
        title: "The Menu tab is the map",
        body:
          "Whatever view you are in, the Menu tab stays on the bar. It lists every screen in the app, grouped by view, plus your tools and account.",
        prompt: "Tap Menu on the bar",
        result: "Everything in the app, on one page. Tapping a row takes you straight there and switches to its view.",
        scene: { kind: "home", phase: "menu" },
        coach: "top",
      },
      {
        id: "header",
        title: "Shortcuts in the header",
        body:
          "Home keeps three round buttons in its header: Printer (the dot turns green when connected), Account, and Scan QR for confirming pickups.",
        prompt: "Tap the Scan QR button",
        result: "The scanner opens. Point it at a customer's order QR to confirm a pickup or accept an order.",
        scene: { kind: "home", phase: "header" },
        coach: "bottom",
      },
    ],
  },
  {
    id: "orders",
    title: "Your first order",
    tagline: "From the chime to Delivered, and how to find any order later",
    icon: "orders",
    gateTab: "orders",
    minutes: 3,
    destination: { workspace: "operations", href: "/(main)/orders", label: "Open Orders" },
    steps: [
      {
        id: "arrive",
        title: "An order arrives",
        body:
          "New orders chime on every tab and land under Needs Attention on Home. Each card shows the customer, the total, and a Pending pill.",
        prompt: "Wait for the order, then tap it to open",
        result:
          "The order opens with every detail: items, options, notes, and how it was paid. The oldest pending order always sits on top of Home.",
        scene: { kind: "home", phase: "arrive" },
        coach: "top",
      },
      {
        id: "confirm",
        title: "Confirm it",
        body:
          "Tap Mark as Confirmed on the card, or open the order for the full details. Confirming tells the customer you have it.",
        prompt: "Tap Mark as Confirmed",
        result:
          "The pill turned Confirmed and the ticket is now on the Kitchen board. If receipts print on confirmation, you are offered Open & print.",
        scene: { kind: "orders", phase: "confirm" },
        coach: "bottom",
      },
      {
        id: "advance",
        title: "Move it along",
        body:
          "Every order walks the same path: Confirmed, Preparing, Ready, Delivered. The button always names the next step, so there is nothing to remember.",
        prompt: "Tap the button until the order is Delivered",
        result:
          "Delivered orders leave the queue and count toward today's revenue on Home. Pickups can be confirmed by scanning the customer's QR instead.",
        scene: { kind: "orderDetail", phase: "advance" },
        coach: "top",
      },
      {
        id: "filter",
        title: "Find any order",
        body:
          "The Orders screen carries a pill for every status with a live count, a search box for names and contacts, and a Newest first toggle.",
        prompt: "Tap the Ready pill",
        result:
          "Only orders waiting to be handed over are shown. Tap All to see everything again, or type a name to search.",
        scene: { kind: "orders", phase: "filter" },
        coach: "bottom",
      },
      {
        id: "cancel",
        title: "Cancel safely",
        body:
          "Cancel is a red link under the card. It always asks first, so a stray tap never loses an order.",
        prompt: "Tap Cancel, then confirm",
        result:
          "Cancelled orders leave the active queue, are excluded from revenue, and any ingredients they used return to stock.",
        scene: { kind: "orders", phase: "cancel" },
        coach: "bottom",
      },
    ],
  },
  {
    id: "kitchen",
    title: "The kitchen board",
    tagline: "Tickets for the pass, with timers and a promised time",
    icon: "kitchen",
    gateTab: "kitchen",
    minutes: 2,
    destination: { workspace: "operations", href: "/(main)/kitchen", label: "Open Kitchen" },
    steps: [
      {
        id: "ticket",
        title: "One ticket per confirmed order",
        body:
          "Every confirmed order becomes a ticket with its items, the customer's name, and a timer that changes colour as it ages. The Ready in chips promise the customer a time.",
        prompt: "Tap a Ready in chip",
        result:
          "The promised time is counted from now and shown to the customer. Tap More for longer options or + to extend.",
        scene: { kind: "kitchen", phase: "ticket" },
        coach: "bottom",
      },
      {
        id: "bump",
        title: "Bump when it's ready",
        body:
          "When the food is up, tap Bump · Ready. The ticket leaves the board and the order becomes Ready everywhere else.",
        prompt: "Tap Bump · Ready",
        result:
          "A Recall bar appears for a moment in case it was bumped early. Print sends a chit to the kitchen printer any time.",
        scene: { kind: "kitchen", phase: "bump" },
        coach: "bottom",
      },
    ],
  },
  {
    id: "register",
    title: "Ring up a sale",
    tagline: "Products, cart, payment, and a swipe to finish",
    icon: "register",
    gateTab: "pos",
    minutes: 3,
    destination: { workspace: "register", href: "/(main)/pos", label: "Open the POS" },
    steps: [
      {
        id: "pick",
        title: "Tap products to build the sale",
        body:
          "The POS shows your menu as tiles under category chips. One tap adds a product; items with options open a sheet first.",
        prompt: "Tap two products",
        result:
          "The cart handle at the bottom counts the items and names them. A badge on each tile shows how many are in the sale.",
        scene: { kind: "register", phase: "pick" },
        coach: "top",
      },
      {
        id: "charge",
        title: "Review and charge",
        body:
          "Pull the cart up to adjust quantities, add a discount, or add a delivery fee. The Charge bar always shows the total.",
        prompt: "Tap the Charge bar",
        result: "The tender screen opens with the amount due in large type and the payment methods you have enabled.",
        scene: { kind: "register", phase: "charge" },
        coach: "top",
      },
      {
        id: "tender",
        title: "Take the payment",
        body:
          "Pick a method. For cash, tap a quick amount or type what you received and the change is worked out for you. Other methods show the customer your QR.",
        prompt: "Tap Cash, then ₱500 (or type the amount)",
        result: "The Change box turned green the moment the cash covered the bill. Nothing to calculate at the counter.",
        scene: { kind: "tender", phase: "tender" },
        coach: "bottom",
      },
      {
        id: "complete",
        title: "Swipe to complete",
        body:
          "A swipe, not a tap, finishes the sale, so a bump of the phone never records money by accident.",
        prompt: "Swipe the bar at the bottom to the right",
        result:
          "The sale is recorded, the receipt prints if a printer is set up, and the app lands on the Drawer with today's takings.",
        scene: { kind: "tender", phase: "complete" },
        coach: "top",
      },
    ],
  },
  {
    id: "drawer",
    title: "Close the drawer",
    tagline: "What the POS took today, and the online orders it confirmed",
    icon: "drawer",
    gateTab: "pos-sales",
    minutes: 1,
    destination: { workspace: "register", href: "/(main)/pos-sales", label: "Open the Drawer" },
    steps: [
      {
        id: "summary",
        title: "Expected in drawer",
        body:
          "One number leads: the cash that should be in the till right now. Under it sit the figures that explain it — what was sold, what never touched the till, and what was handed back out.",
        prompt: "Tap + Smart Menu",
        result:
          "Online orders confirmed on this device are now counted too, using what has actually been paid. The switch at the top governs every number below it, and it is a per-device setting.",
        scene: { kind: "drawer", phase: "summary" },
        coach: "bottom",
      },
      {
        id: "incoming",
        title: "Accept incoming orders here too",
        body:
          "Orders that arrived from anywhere but this till are listed under the takings, so a cashier can accept them without leaving the POS.",
        prompt: "Tap Accept",
        result: "The order moves to Confirmed and shows up on the Kitchen board like any other.",
        scene: { kind: "drawer", phase: "incoming" },
        coach: "bottom",
      },
    ],
  },
  {
    id: "products",
    title: "Manage your menu",
    tagline: "Sold-out switches, editing, and knowing your margin",
    icon: "manage",
    gateTab: "product-management",
    minutes: 2,
    destination: { workspace: "products", href: "/(main)/product-management", label: "Open Manage products" },
    steps: [
      {
        id: "availability",
        title: "Mark something sold out",
        body:
          "Every product row has a switch. Turn it off and the item stays on your online menu but cannot be ordered.",
        prompt: "Turn the switch off",
        result:
          "Your online menu updated right away and shows the item as sold out. Turn it back on when it is back.",
        scene: { kind: "products", phase: "availability" },
        coach: "bottom",
      },
      {
        id: "edit",
        title: "Edit a product",
        body:
          "Tap a row to open it: photo, name, price, discounted price, category, and the Available and Featured switches. Add product in the header creates a new one.",
        prompt: "Tap Save Product",
        result: "Saved. Prices and photos change on the customer menu the moment you save.",
        scene: { kind: "products", phase: "edit" },
        coach: "top",
      },
      {
        id: "margin",
        title: "Know your margin",
        body:
          "Under Cost & Profit, enter what the item costs to make. The list then shows the margin on every product.",
        prompt: "Enter a cost, or tap ₱45",
        result: "The margin badge appears on the row, green when healthy and red when the item loses money.",
        scene: { kind: "products", phase: "margin" },
        coach: "top",
      },
    ],
  },
  {
    id: "stock",
    title: "Track your stock",
    tagline: "Shelf status at a glance, and recording what arrives",
    icon: "stock",
    gateTab: "inventory",
    minutes: 2,
    destination: { workspace: "products", href: "/(main)/inventory", label: "Open Stock" },
    steps: [
      {
        id: "shelf",
        title: "Shelf status",
        body:
          "Stock opens with a one-line verdict and three counts: Out, Low, and Stocked. Each is a filter, and the list below is sorted worst-first.",
        prompt: "Tap Low",
        result: "Only ingredients under their reorder line are shown. Tap it again to show everything.",
        scene: { kind: "stock", phase: "shelf" },
        coach: "bottom",
      },
      {
        id: "record",
        title: "Record a delivery",
        body:
          "Tap an ingredient, choose Received, Counted, or Wasted, and enter the amount. A before-and-after preview shows the new level before you save.",
        prompt: "Tap Espresso beans, then Record Received",
        result:
          "From here on every order deducts its ingredients automatically, and a dish whose ingredient runs out is marked out of stock for you.",
        scene: { kind: "stock", phase: "record" },
        coach: "top",
      },
    ],
  },
  {
    id: "insights",
    title: "Read your numbers",
    tagline: "Analytics, a growth plan, and your guest list",
    icon: "analytics",
    gateTab: "analytics",
    minutes: 2,
    destination: { workspace: "insights", href: "/(main)/analytics", label: "Open Analytics" },
    steps: [
      {
        id: "analytics",
        title: "Analytics",
        body:
          "Revenue, orders, and average order value for the last 7, 14, or 30 days, broken down by order type and payment method, with your busiest hours.",
        prompt: "Tap 30 days",
        result: "Every card re-computes for the longer window. Export in the header shares the numbers as a CSV.",
        scene: { kind: "insights", phase: "analytics" },
        coach: "bottom",
      },
      {
        id: "growth",
        title: "Growth engine",
        body:
          "Growth scores the levers behind your revenue against benchmarks and gives one verdict. The coach turns those numbers into a plan.",
        prompt: "Tap Ask the coach",
        result: "The coach answers from your own numbers, never from guesses, and suggests the one lever to pull next.",
        scene: { kind: "insights", phase: "growth" },
        coach: "top",
      },
      {
        id: "customers",
        title: "Your guest list",
        body:
          "Customers appear automatically once orders come in. Filter the roster by how recently they ordered, then reach them with a campaign.",
        prompt: "Tap New campaign, then Schedule campaign",
        result: "A campaign is one message, sent to the guests you choose, on a date you pick.",
        scene: { kind: "insights", phase: "customers" },
        coach: "top",
      },
    ],
  },
  {
    id: "tools",
    title: "Printer and pickups",
    tagline: "Connect a receipt printer and confirm pickups by QR",
    icon: "printer",
    gateTab: null,
    minutes: 2,
    destination: { workspace: null, href: "/(main)/printer-settings", label: "Open Printer settings" },
    steps: [
      {
        id: "printer",
        title: "Connect a printer",
        body:
          "Under Add a Printer, scan for Bluetooth printers or enter a network printer's address. Give each one a role: Cashier prints receipts, Kitchen prints chits.",
        prompt: "Tap Scan for Printers, then Add the one it finds",
        result: "The printer is saved with a green dot. Test Print sends a sample so you know it is talking.",
        scene: { kind: "tools", phase: "printer" },
        coach: "top",
      },
      {
        id: "trigger",
        title: "When receipts print",
        body:
          "Choose whether a receipt prints when you confirm an order, when the bill is settled, both, or only when you tap Reprint.",
        prompt: "Tap On bill out",
        result: "Kitchen Auto-Print is separate: it fires a chit the moment an order arrives, on whichever tab is open.",
        scene: { kind: "tools", phase: "trigger" },
        coach: "bottom",
      },
      {
        id: "scan",
        title: "Confirm a pickup by QR",
        body:
          "Every customer's order page carries a QR. Scan it at the counter and slide to confirm; the order is marked handed over.",
        prompt: "Simulate a scan, then slide to confirm",
        result: "Pickup confirmed. A code that was already collected says so, so nothing is handed over twice.",
        scene: { kind: "tools", phase: "scan" },
        coach: "top",
      },
    ],
  },
  {
    id: "team",
    title: "Add your team",
    tagline: "Staff accounts that see only what you choose",
    icon: "customers",
    gateTab: null,
    ownersOnly: true,
    minutes: 2,
    destination: { workspace: null, href: "/(main)/team", label: "Open Team" },
    steps: [
      {
        id: "invite",
        title: "Create a staff account",
        body:
          "Team lives under Menu and Account. Add a staff member with their name and email, and they sign in to this app with their own password.",
        prompt: "Tap Add staff, then Create account",
        result: "Up to three staff accounts per store. Each one can be edited or removed later.",
        scene: { kind: "team", phase: "invite" },
        coach: "bottom",
      },
      {
        id: "permissions",
        title: "Choose what they see",
        body:
          "Grant each screen separately. A cashier with only the POS sees only the POS's tabs, and you can pin the screen they open on.",
        prompt: "Turn on POS only",
        result: "Their bar shrinks to exactly the tabs they hold. Everything else is invisible, not just locked.",
        scene: { kind: "team", phase: "permissions" },
        coach: "bottom",
      },
    ],
  },
  {
    id: "branches",
    title: "Run several branches",
    tagline: "Every branch at a glance, and what each one sells",
    icon: "storefront",
    gateTab: "portfolio",
    minutes: 2,
    destination: { workspace: "business", href: "/(main)/portfolio", label: "Open Branches" },
    steps: [
      {
        id: "portfolio",
        title: "Every branch at a glance",
        body:
          "The Business view lists each branch with today's takings and a verdict. Tap one to narrow the whole app to that branch.",
        prompt: "Tap a branch",
        result:
          "A bar at the top says which branch you are viewing. Orders, Kitchen, and Stock now show only that branch.",
        scene: { kind: "branches", phase: "portfolio" },
        coach: "bottom",
      },
      {
        id: "menu",
        title: "What each branch sells",
        body:
          "Branch products lets one branch hide an item or price it differently. With no override, a product is sold store-wide as usual.",
        prompt: "Turn the item off for one branch",
        result: "Only that branch stops selling it. Every other branch, and the store-wide menu, is untouched.",
        scene: { kind: "branches", phase: "menu" },
        coach: "bottom",
      },
    ],
  },
];

export function getChapter(id: string): TutorialChapter | undefined {
  return TUTORIAL_CHAPTERS.find((chapter) => chapter.id === id);
}
