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
  | "external";

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
};
