import React from "react";
import Svg, { Circle, Line, Path, Polyline, Rect } from "react-native-svg";

/**
 * The app's icon system.
 *
 * Every icon in the tab bar used to be a Unicode character in a `<Text>` — ☺
 * for Customers, ⊞ for Home, ☰ for Orders. Those are font glyphs, not icons:
 * the OEM font decides their weight, their optical size and their alignment,
 * several of them arrive as full-colour emoji on newer Android builds, and the
 * bar reads as sixteen unrelated marks because it literally is.
 *
 * These are drawn instead, on one geometry: a 24 unit box, 1.75 stroke, square
 * caps, mitred joins, no fill. Square and mitred rather than round is not a
 * neutral choice — it matches the Branding Studio's editorial character, which
 * PRODUCT.md names as the binding house style for merchant surfaces.
 *
 * `color` is passed straight through as `stroke`, so an icon inherits whatever
 * the tab bar hands it (amber when active, translucent cream when not) with no
 * per-icon state of its own.
 */

export type IconName =
  // Tab bar
  | "dashboard"
  | "orders"
  | "register"
  | "drawer"
  | "analytics"
  | "growth"
  | "customers"
  | "trends"
  | "performance"
  | "manage"
  | "stock"
  | "report"
  | "payments"
  | "voucher"
  | "storefront"
  | "compare"
  | "list"
  | "kitchen"
  | "tables"
  // In-screen
  | "search"
  | "check"
  | "gift"
  | "send"
  | "message"
  | "plus"
  | "edit"
  | "chevron"
  | "calendar"
  | "clock"
  // Navigation chrome
  | "menu"
  | "back"
  | "chevron-down"
  | "close"
  | "qr"
  | "printer"
  | "account"
  | "settings"
  | "logout"
  | "export"
  | "info"
  | "warning"
  | "bell"
  | "arrow-right"
  | "chevron-left"
  | "minus"
  | "trash"
  | "rotate"
  // Receipt editor
  | "arrow-up"
  | "arrow-down"
  | "duplicate"
  | "bold"
  | "align-left"
  | "align-center"
  | "align-right"
  | "undo"
  // Owl assistant
  | "photo"
  | "mic"
  // Delivery address
  | "pin"
  | "external"
  // Approvals
  | "shield"
  // Expenses
  | "lock"
  | "wallet"
  | "receipt"
  | "backspace"
  // Expense categories (lib/expenses/category-look.ts)
  | "basket"
  | "ice"
  | "cup"
  | "box"
  | "people"
  | "utensils"
  | "home"
  | "bolt"
  | "droplet"
  | "flame"
  | "wifi"
  | "bike"
  | "percent"
  | "car"
  | "sparkle"
  | "wrench"
  | "megaphone"
  | "document"
  | "calculator"
  | "bank"
  | "appliance"
  | "cash-out"
  | "dots"
  | "grid"
  | "camera"
  | "note"
  | "repeat";

interface IconProps {
  name: IconName;
  size?: number;
  color: string;
  /** Only widen this for oversized marks; the bar's icons all share the default. */
  strokeWidth?: number;
  /** For the rare icon a test addresses directly, e.g. an empty-state stand-in. */
  testID?: string;
}

export function Icon({ name, size = 22, color, strokeWidth = 1.75, testID }: IconProps) {
  return (
    <Svg
      testID={testID}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      {GLYPHS[name]}
    </Svg>
  );
}

/**
 * The tab bar's icon.
 *
 * Separate from `Icon` only so the bar's size lives in one place rather than
 * being repeated at sixteen call sites, where one of them would eventually
 * drift.
 */
export function TabIcon({ name, color }: { name: IconName; color: string }) {
  return <Icon name={name} color={color} size={23} />;
}

const GLYPHS: Record<IconName, React.ReactNode> = {
  // A panelled board: one wide row above, two cells below.
  dashboard: (
    <>
      <Rect x={3} y={4} width={18} height={16} />
      <Line x1={3} y1={10.5} x2={21} y2={10.5} />
      <Line x1={11} y1={10.5} x2={11} y2={20} />
    </>
  ),

  // A receipt, torn along the bottom. Distinct from `list` on purpose: these
  // sit in the same bar and a merchant reaches for them mid-service.
  orders: (
    <>
      <Path d="M5 3h14v18l-2.33-1.6L14.33 21l-2.33-1.6L9.67 21l-2.34-1.6L5 21z" />
      <Line x1={8.5} y1={8} x2={15.5} y2={8} />
      <Line x1={8.5} y1={12} x2={15.5} y2={12} />
    </>
  ),

  // A counter terminal: screen on a body, card slot across the front.
  register: (
    <>
      <Path d="M7 4h10v5H7z" />
      <Rect x={4} y={9} width={16} height={11} />
      <Line x1={8} y1={14.5} x2={16} y2={14.5} />
    </>
  ),

  // The cash drawer, front on, with its handle.
  drawer: (
    <>
      <Rect x={3} y={8} width={18} height={11} />
      <Line x1={3} y1={13} x2={21} y2={13} />
      <Line x1={10} y1={16} x2={14} y2={16} />
    </>
  ),

  analytics: (
    <>
      <Line x1={4} y1={20} x2={20} y2={20} />
      <Line x1={7.5} y1={20} x2={7.5} y2={13} />
      <Line x1={12} y1={20} x2={12} y2={8} />
      <Line x1={16.5} y1={20} x2={16.5} y2={15} />
    </>
  ),

  growth: (
    <>
      <Polyline points="4,17 9,12 13,15 20,7" />
      <Polyline points="14.5,7 20,7 20,12.5" />
    </>
  ),

  // Two guests, one behind the other: a roster, not a mood. The mark this
  // whole redesign was asked for — ☺ read as a smiley face, which said
  // nothing about who is on the list or whether they can be reached.
  customers: (
    <>
      <Circle cx={9.5} cy={8} r={3.5} />
      <Path d="M3.5 20v-1.5c0-2.2 2.7-4 6-4s6 1.8 6 4V20" />
      <Path d="M16 5.2a3.5 3.5 0 0 1 0 6.6" />
      <Path d="M18 15.1c1.6.7 2.5 1.9 2.5 3.4V20" />
    </>
  ),

  trends: (
    <>
      <Polyline points="4,19 4,4" />
      <Polyline points="4,19 20,19" />
      <Polyline points="7,15 11,10 14.5,13 19,6" />
    </>
  ),

  // Bars read inside a frame: performance of things, not of the shop.
  performance: (
    <>
      <Rect x={3} y={4} width={18} height={16} />
      <Line x1={8} y1={16.5} x2={8} y2={11} />
      <Line x1={12} y1={16.5} x2={12} y2={7.5} />
      <Line x1={16} y1={16.5} x2={16} y2={13} />
    </>
  ),

  manage: (
    <>
      <Path d="M14.5 4.5l5 5L9 20H4v-5z" />
      <Line x1={12.5} y1={6.5} x2={17.5} y2={11.5} />
    </>
  ),

  // Stacked cases.
  stock: (
    <>
      <Rect x={3} y={12} width={8} height={7} />
      <Rect x={13} y={12} width={8} height={7} />
      <Rect x={8} y={5} width={8} height={7} />
    </>
  ),

  report: (
    <>
      <Path d="M6 3h8l4 4v14H6z" />
      <Polyline points="14,3 14,7 18,7" />
      <Line x1={9} y1={12} x2={15} y2={12} />
      <Line x1={9} y1={16} x2={13} y2={16} />
    </>
  ),

  // A banknote. Deliberately not the ₱ glyph the bar used to print, which is
  // the same font-dependency problem in a different costume.
  payments: (
    <>
      <Rect x={2.5} y={6} width={19} height={12} />
      <Circle cx={12} cy={12} r={2.75} />
      <Line x1={6} y1={12} x2={6.5} y2={12} />
      <Line x1={17.5} y1={12} x2={18} y2={12} />
    </>
  ),

  // A ticket with a notch in each side and a perforated stub: a promo code.
  // Distinct from `payments` beside it in the hub — money off, not money in.
  voucher: (
    <>
      <Path d="M3 6 H21 V9.5 A2.5 2.5 0 0 0 21 14.5 V18 H3 V14.5 A2.5 2.5 0 0 0 3 9.5 Z" />
      <Line x1={15} y1={7.5} x2={15} y2={9} />
      <Line x1={15} y1={11.25} x2={15} y2={12.75} />
      <Line x1={15} y1={15} x2={15} y2={16.5} />
    </>
  ),

  // A storefront with its awning: the business as a place.
  storefront: (
    <>
      <Path d="M3.5 8l1.8-4h13.4l1.8 4z" />
      <Path d="M4.5 8v12h15V8" />
      <Path d="M10 20v-6h4v6" />
    </>
  ),

  // Two branches measured against each other.
  compare: (
    <>
      <Line x1={8} y1={20} x2={8} y2={5} />
      <Polyline points="5,8 8,5 11,8" />
      <Line x1={16} y1={4} x2={16} y2={19} />
      <Polyline points="13,16 16,19 19,16" />
    </>
  ),

  list: (
    <>
      <Line x1={4} y1={7} x2={4.5} y2={7} />
      <Line x1={4} y1={12} x2={4.5} y2={12} />
      <Line x1={4} y1={17} x2={4.5} y2={17} />
      <Line x1={8} y1={7} x2={20} y2={7} />
      <Line x1={8} y1={12} x2={20} y2={12} />
      <Line x1={8} y1={17} x2={20} y2={17} />
    </>
  ),

  // A serving cloche on its tray: the pass, where tickets become plates.
  kitchen: (
    <>
      <Path d="M4 15a8 8 0 0 1 16 0" />
      <Line x1={2.5} y1={15} x2={21.5} y2={15} />
      <Line x1={12} y1={7} x2={12} y2={4.5} />
      <Line x1={10.5} y1={4.5} x2={13.5} y2={4.5} />
      <Line x1={6} y1={19} x2={18} y2={19} />
    </>
  ),

  // A pencil, for the floor's layout mode.
  edit: (
    <>
      <Path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
      <Line x1={13.5} y1={6.5} x2={17.5} y2={10.5} />
    </>
  ),

  // A round table top between two chairs: the floor, seen from the host stand.
  tables: (
    <>
      <Circle cx={12} cy={12} r={4.5} />
      <Line x1={12} y1={16.5} x2={12} y2={20} />
      <Line x1={9} y1={20} x2={15} y2={20} />
      <Path d="M3 9v6" />
      <Path d="M2 9h2.5v6H2" />
      <Path d="M21 9v6" />
      <Path d="M22 9h-2.5v6H22" />
    </>
  ),

  search: (
    <>
      <Circle cx={10.5} cy={10.5} r={6.5} />
      <Line x1={15.5} y1={15.5} x2={20} y2={20} />
    </>
  ),

  check: <Polyline points="4,12.5 9.5,18 20,6" />,

  // A paper dart leaving to the upper right: the moment a text goes out.
  send: (
    <>
      <Path d="M21 3L3 10.5l7 3 3 7.5z" />
      <Line x1={21} y1={3} x2={10} y2={13.5} />
    </>
  ),

  // A speech balloon with its tail at the lower left: a text that arrived.
  message: <Path d="M4 4.5h16v11H9.5L5 19.5v-4H4z" />,

  // A wrapped box with a bow: what a reward card pays out.
  gift: (
    <>
      <Rect x={3.5} y={8} width={17} height={4} />
      <Rect x={5} y={12} width={14} height={8.5} />
      <Line x1={12} y1={8} x2={12} y2={20.5} />
      <Path d="M12 8c-1.5-3.2-5.5-3.6-5.5-1.3S10 8 12 8zM12 8c1.5-3.2 5.5-3.6 5.5-1.3S14 8 12 8z" />
    </>
  ),

  plus: (
    <>
      <Line x1={12} y1={4} x2={12} y2={20} />
      <Line x1={4} y1={12} x2={20} y2={12} />
    </>
  ),

  chevron: <Polyline points="9,4 17,12 9,20" />,

  calendar: (
    <>
      <Rect x={3.5} y={5} width={17} height={16} />
      <Line x1={3.5} y1={10} x2={20.5} y2={10} />
      <Line x1={8} y1={3} x2={8} y2={7} />
      <Line x1={16} y1={3} x2={16} y2={7} />
    </>
  ),

  clock: (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Polyline points="12,6.5 12,12 16.5,14" />
    </>
  ),

  // Four panels: the whole app laid out on one screen.
  menu: (
    <>
      <Rect x={3.5} y={3.5} width={7} height={7} />
      <Rect x={13.5} y={3.5} width={7} height={7} />
      <Rect x={3.5} y={13.5} width={7} height={7} />
      <Rect x={13.5} y={13.5} width={7} height={7} />
    </>
  ),

  back: <Polyline points="15,4 7,12 15,20" />,

  "chevron-down": <Polyline points="4,9 12,17 20,9" />,

  close: (
    <>
      <Line x1={5} y1={5} x2={19} y2={19} />
      <Line x1={19} y1={5} x2={5} y2={19} />
    </>
  ),

  // Three finder squares and a scatter of modules.
  qr: (
    <>
      <Rect x={3.5} y={3.5} width={7} height={7} />
      <Rect x={13.5} y={3.5} width={7} height={7} />
      <Rect x={3.5} y={13.5} width={7} height={7} />
      <Line x1={6.5} y1={7} x2={7.5} y2={7} />
      <Line x1={16.5} y1={7} x2={17.5} y2={7} />
      <Line x1={6.5} y1={17} x2={7.5} y2={17} />
      <Line x1={13.5} y1={14} x2={16} y2={14} />
      <Line x1={20.5} y1={14} x2={20.5} y2={16.5} />
      <Line x1={14} y1={20.5} x2={16.5} y2={20.5} />
      <Line x1={19} y1={18.5} x2={20.5} y2={20.5} />
    </>
  ),

  printer: (
    <>
      <Path d="M7 8V3.5h10V8" />
      <Path d="M7 16H3.5V8h17v8H17" />
      <Rect x={7} y={13} width={10} height={7.5} />
    </>
  ),

  account: (
    <>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 20.5v-.5c0-3.3 3.6-5.5 8-5.5s8 2.2 8 5.5v.5" />
    </>
  ),

  // Two sliders: the settings that get adjusted, not a gear that decorates.
  settings: (
    <>
      <Line x1={4} y1={7.5} x2={12.5} y2={7.5} />
      <Circle cx={15.5} cy={7.5} r={2.5} />
      <Line x1={18} y1={7.5} x2={20} y2={7.5} />
      <Line x1={4} y1={16.5} x2={6} y2={16.5} />
      <Circle cx={8.5} cy={16.5} r={2.5} />
      <Line x1={11} y1={16.5} x2={20} y2={16.5} />
    </>
  ),

  logout: (
    <>
      <Path d="M14 4.5h5.5v15H14" />
      <Line x1={3.5} y1={12} x2={14.5} y2={12} />
      <Polyline points="10.5,8 14.5,12 10.5,16" />
    </>
  ),

  export: (
    <>
      <Path d="M4 14.5v5.5h16v-5.5" />
      <Line x1={12} y1={4} x2={12} y2={15} />
      <Polyline points="8,8 12,4 16,8" />
    </>
  ),

  info: (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Line x1={12} y1={11} x2={12} y2={16.5} />
      <Line x1={12} y1={7.5} x2={12} y2={8} />
    </>
  ),

  // A triangle with the mark inside: the shape merchants already know from
  // every road sign, drawn on the same stroke as the rest of the set.
  warning: (
    <>
      <Path d="M12 3.5L21 20H3z" />
      <Line x1={12} y1={9.5} x2={12} y2={14} />
      <Line x1={12} y1={16.5} x2={12} y2={17} />
    </>
  ),

  "arrow-right": (
    <>
      <Line x1={4} y1={12} x2={19.5} y2={12} />
      <Polyline points="13.5,6 19.5,12 13.5,18" />
    </>
  ),

  "chevron-left": <Polyline points="14.5,5.5 8,12 14.5,18.5" />,

  minus: <Line x1={5} y1={12} x2={19} y2={12} />,

  // A quarter turn: three quarters of a circle, with the arrowhead that
  // closes it drawn open so the direction of the turn reads at 16pt.
  rotate: (
    <>
      <Path d="M20 12a8 8 0 1 1-2.5-5.8" />
      <Polyline points="20,3 20,8.5 14.5,8.5" />
    </>
  ),

  trash: (
    <>
      <Line x1={4} y1={7} x2={20} y2={7} />
      <Path d="M9.5 7V4h5v3" />
      <Path d="M6 7l1 13.5h10L18 7" />
    </>
  ),

  "arrow-up": (
    <>
      <Line x1={12} y1={20} x2={12} y2={4.5} />
      <Polyline points="6,10.5 12,4.5 18,10.5" />
    </>
  ),

  "arrow-down": (
    <>
      <Line x1={12} y1={4} x2={12} y2={19.5} />
      <Polyline points="6,13.5 12,19.5 18,13.5" />
    </>
  ),

  // Two sheets offset: the block and its copy.
  duplicate: (
    <>
      <Rect x={8.5} y={8.5} width={12} height={12} />
      <Path d="M15.5 8.5V3.5h-12v12h5" />
    </>
  ),

  // A drawn B, not a font glyph, so it sits on the same stroke as the set.
  bold: (
    <>
      <Path d="M7 4.5h6a3.75 3.75 0 0 1 0 7.5H7z" />
      <Path d="M7 12h7a4 4 0 0 1 0 8H7z" />
    </>
  ),

  "align-left": (
    <>
      <Line x1={4} y1={6} x2={20} y2={6} />
      <Line x1={4} y1={10} x2={14} y2={10} />
      <Line x1={4} y1={14} x2={20} y2={14} />
      <Line x1={4} y1={18} x2={14} y2={18} />
    </>
  ),

  "align-center": (
    <>
      <Line x1={4} y1={6} x2={20} y2={6} />
      <Line x1={7} y1={10} x2={17} y2={10} />
      <Line x1={4} y1={14} x2={20} y2={14} />
      <Line x1={7} y1={18} x2={17} y2={18} />
    </>
  ),

  "align-right": (
    <>
      <Line x1={4} y1={6} x2={20} y2={6} />
      <Line x1={10} y1={10} x2={20} y2={10} />
      <Line x1={4} y1={14} x2={20} y2={14} />
      <Line x1={10} y1={18} x2={20} y2={18} />
    </>
  ),

  // A hook turning back on itself: the step you just took, taken back.
  undo: (
    <>
      <Polyline points="8.5,4.5 4,9 8.5,13.5" />
      <Path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H9" />
    </>
  ),

  // A framed picture — sun over a hill: a photo to send.
  photo: (
    <>
      <Rect x={3.5} y={4.5} width={17} height={15} />
      <Circle cx={9} cy={10} r={1.75} />
      <Polyline points="3.5,17 9.5,12.5 13,15 16,12.5 20.5,16" />
    </>
  ),
  mic: (
    <>
      <Rect x={9} y={3} width={6} height={11.5} rx={3} />
      <Path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <Line x1={12} y1={17.5} x2={12} y2={21} />
    </>
  ),
  pin: (
    <>
      <Path d="M12 21s-6.5-6.2-6.5-11.5a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z" />
      <Circle cx={12} cy={9.5} r={2.25} />
    </>
  ),
  external: (
    <>
      <Path d="M14 4h6v6" />
      <Line x1={20} y1={4} x2={11} y2={13} />
      <Path d="M18 14v6H4V6h6" />
    </>
  ),
  // A bell with its clapper: the notifications inbox, and a request waiting
  // for someone. One glyph for both.
  bell: (
    <>
      <Path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
      <Path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  // A shield with a tick: the rules that guard the till.
  shield: (
    <>
      <Path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z" />
      <Polyline points="8.5,12 11,14.5 15.5,9.5" />
    </>
  ),
  // A closed padlock: a choice that is fixed here (the drawer an expense is paid from).
  lock: (
    <>
      <Rect x={5} y={10.5} width={14} height={10} />
      <Path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  // A wallet with its clasp: where money is paid from.
  wallet: (
    <>
      <Path d="M4 7h14.5v12H4z" />
      <Path d="M4 7l11-3.5V7" />
      <Rect x={13.5} y={11} width={5} height={4} />
    </>
  ),
  // A till slip with a torn foot: money that went out, on paper.
  receipt: (
    <>
      <Path d="M6 3.5h12v17l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z" />
      <Line x1={9} y1={8.5} x2={15} y2={8.5} />
      <Line x1={9} y1={12} x2={15} y2={12} />
    </>
  ),
  // A key with a cross in it, pointing back: delete the last digit.
  backspace: (
    <>
      <Path d="M9 5.5h11.5v13H9L3.5 12z" />
      <Line x1={11.5} y1={9.5} x2={16.5} y2={14.5} />
      <Line x1={16.5} y1={9.5} x2={11.5} y2={14.5} />
    </>
  ),
  // ── Expense categories: one mark per kind of spending, read at 15–32px. ──
  // A market basket with its handles: palengke / ingredients.
  basket: (
    <>
      <Path d="M4 10h16l-1.6 9.5H5.6z" />
      <Path d="M8 10l3-6M16 10l-3-6" />
      <Line x1={10} y1={13.5} x2={10} y2={16.5} />
      <Line x1={14} y1={13.5} x2={14} y2={16.5} />
    </>
  ),
  // A snowflake: yelo. (A cube read as the packaging box beside it.)
  ice: (
    <>
      <Path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
      <Path d="M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5" />
    </>
  ),
  // A tall cup with a straw: drinks and bar stock.
  cup: (
    <>
      <Path d="M6 8h12l-1.5 12.5h-9z" />
      <Path d="M13 8l1.5-4.5H18" />
    </>
  ),
  // A closed carton: packaging, lalagyan.
  box: (
    <>
      <Path d="M4 8l8-4 8 4v8.5l-8 4-8-4z" />
      <Path d="M4 8l8 4 8-4M12 12v8.5" />
    </>
  ),
  // Two people: wages, the team.
  people: (
    <>
      <Circle cx={9} cy={8.5} r={3.2} />
      <Path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <Path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.5 14.8c1.6.7 2.7 2.3 3 4.7" />
    </>
  ),
  // Fork and spoon: staff meals.
  utensils: (
    <>
      <Path d="M7 3.5v6a2 2 0 0 0 2 2v9M11 3.5v6a2 2 0 0 1-2 2M9 3.5v5" />
      <Path d="M16.5 20.5V3.5c-2 1-3 3.3-3 6.5v3h3" />
    </>
  ),
  // A house: rent, upa.
  home: (
    <>
      <Path d="M4 11l8-6.5 8 6.5v9.5H4z" />
      <Path d="M10 20.5v-5h4v5" />
    </>
  ),
  // A lightning bolt: electricity, kuryente.
  bolt: <Path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" />,
  // A drop: water, tubig.
  droplet: <Path d="M12 3.5c3.4 4.2 5.5 7.3 5.5 10a5.5 5.5 0 0 1-11 0c0-2.7 2.1-5.8 5.5-10z" />,
  // A flame: LPG and cooking gas.
  flame: (
    <Path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.9 3.6-5.6 3.6-9.4 2.5 1.4 4 3.4 4.2 5.8.9-.6 1.5-1.6 1.6-2.8 1.7 1.6 2.6 3.7 2.6 6.4 0 3.2-2.4 5.6-6 5.6z" />
  ),
  // Signal arcs: internet and load.
  wifi: (
    <>
      <Path d="M3 9.5a13 13 0 0 1 18 0M6 13a8.5 8.5 0 0 1 12 0M9 16.5a4 4 0 0 1 6 0" />
      <Rect x={11} y={19} width={2} height={2} />
    </>
  ),
  // A motorbike: riders and delivery.
  bike: (
    <>
      <Circle cx={6} cy={16.5} r={3} />
      <Circle cx={18} cy={16.5} r={3} />
      <Path d="M6 16.5l4-7h5l3 7M13 9.5L11.5 6H9" />
    </>
  ),
  // A percent sign: platform commissions and payment fees.
  percent: (
    <>
      <Line x1={18.5} y1={5.5} x2={5.5} y2={18.5} />
      <Circle cx={7.5} cy={7.5} r={2.5} />
      <Circle cx={16.5} cy={16.5} r={2.5} />
    </>
  ),
  // A jeep from the side: transport, pamasahe.
  car: (
    <>
      <Path d="M3.5 16.5V11l2-5h13l2 5v5.5z" />
      <Line x1={3.5} y1={11} x2={20.5} y2={11} />
      <Circle cx={7.5} cy={17.5} r={1.8} />
      <Circle cx={16.5} cy={17.5} r={1.8} />
    </>
  ),
  // A four-point sparkle: cleaning.
  sparkle: (
    <>
      <Path d="M11 3.5l1.8 5.2 5.2 1.8-5.2 1.8L11 17.5l-1.8-5.2L4 10.5l5.2-1.8z" />
      <Path d="M18 15.5v5M15.5 18h5" />
    </>
  ),
  // A wrench: repairs, pagawa.
  wrench: <Path d="M14.5 5.5a4 4 0 0 0-5 5L4 16v4h4l5.5-5.5a4 4 0 0 0 5-5l-2.6 2.6-2.5-.5-.5-2.5z" />,
  // A megaphone: marketing and ads.
  megaphone: (
    <>
      <Path d="M4 10h4l9-5v14l-9-5H4z" />
      <Path d="M8 14l1.5 5.5h3L11 15.6" />
    </>
  ),
  // A form with a stamp line: permits and taxes.
  document: (
    <>
      <Path d="M6 3.5h8.5l3.5 3.5v13.5H6z" />
      <Path d="M14.5 3.5V7H18" />
      <Line x1={9} y1={12} x2={15} y2={12} />
      <Line x1={9} y1={15.5} x2={13} y2={15.5} />
    </>
  ),
  // A calculator: the accountant and software.
  calculator: (
    <>
      <Rect x={5.5} y={3.5} width={13} height={17} />
      <Rect x={8.5} y={6.5} width={7} height={3} />
      <Path d="M9 13h.5M12 13h.5M15 13h.5M9 16.5h.5M12 16.5h.5M15 16.5h.5" />
    </>
  ),
  // A bank front: bank charges, deposits and loans.
  bank: (
    <>
      <Path d="M3.5 9.5L12 4.5l8.5 5z" />
      <Path d="M6 9.5v8M10 9.5v8M14 9.5v8M18 9.5v8M3.5 20h17" />
    </>
  ),
  // A range with its burners: a big equipment purchase.
  appliance: (
    <>
      <Rect x={4.5} y={3.5} width={15} height={17} />
      <Line x1={4.5} y1={9} x2={19.5} y2={9} />
      <Rect x={8} y={12} width={8} height={5.5} />
      <Path d="M8 6.2h.5M11.75 6.2h.5M15.5 6.2h.5" />
    </>
  ),
  // A bill leaving a hand-held stack: cash taken out, not spent.
  "cash-out": (
    <>
      <Rect x={3.5} y={10} width={14} height={9} />
      <Circle cx={10.5} cy={14.5} r={2} />
      <Path d="M14 6.5h6.5M17.5 3.5l3 3-3 3" />
    </>
  ),
  // Three dots: anything else.
  dots: (
    <>
      <Circle cx={6} cy={12} r={1.2} />
      <Circle cx={12} cy={12} r={1.2} />
      <Circle cx={18} cy={12} r={1.2} />
    </>
  ),
  // Four squares: every category.
  grid: (
    <>
      <Rect x={4} y={4} width={7} height={7} />
      <Rect x={13} y={4} width={7} height={7} />
      <Rect x={4} y={13} width={7} height={7} />
      <Rect x={13} y={13} width={7} height={7} />
    </>
  ),
  // A camera body: take a receipt photo.
  camera: (
    <>
      <Path d="M4 8h3.5L9 5.5h6L16.5 8H20v11H4z" />
      <Circle cx={12} cy={13.2} r={3.3} />
    </>
  ),
  // A ruled note: what the money was for.
  note: (
    <>
      <Rect x={5} y={4} width={14} height={16} />
      <Path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" />
    </>
  ),
  // Two arrows chasing each other: do the same again.
  repeat: <Path d="M5 11V8h12M14 5l3 3-3 3M19 13v3H7M10 19l-3-3 3-3" />,
};
