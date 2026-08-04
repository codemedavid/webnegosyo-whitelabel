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
  | "storefront"
  | "compare"
  | "list"
  // In-screen
  | "search"
  | "check"
  | "plus"
  | "chevron"
  | "calendar"
  | "clock";

interface IconProps {
  name: IconName;
  size?: number;
  color: string;
  /** Only widen this for oversized marks; the bar's icons all share the default. */
  strokeWidth?: number;
}

export function Icon({ name, size = 22, color, strokeWidth = 1.75 }: IconProps) {
  return (
    <Svg
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

  search: (
    <>
      <Circle cx={10.5} cy={10.5} r={6.5} />
      <Line x1={15.5} y1={15.5} x2={20} y2={20} />
    </>
  ),

  check: <Polyline points="4,12.5 9.5,18 20,6" />,

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
};
