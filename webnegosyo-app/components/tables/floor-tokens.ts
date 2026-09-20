/**
 * The floor's own surface tones, on top of the cream theme. A host stand is
 * read from a step away, so the floor is drawn as the room actually looks —
 * wooden tops, chairs pulled in around them — on a canvas one shade below
 * the screen, and each state is a ring colour a glance can tell apart rather
 * than a label that has to be read.
 */

import { colors } from "../../theme/colors";
import type { TableStatus } from "../../lib/tables/table-floor";

export const floor = {
  canvas: "#E6E1D8",
  canvasEdge: "#D8D1C5",
  grid: "#CFC8BC",
  gridEditing: "#B8B0A3",
  node: colors.card,
  nodeInk: colors.textPrimary,
  nodeMuted: colors.textSecondary,
  grip: "#C9C2B6",

  // The table itself: a warm oak top, a darker edge where the apron shows,
  // and a grain a shade deeper than both.
  woodTop: "#E8D2AF",
  woodInlay: "#F0DEC2",
  woodEdge: "#B99763",
  woodGrain: "rgba(124, 84, 40, 0.16)",
  woodShade: "rgba(45, 33, 22, 0.20)",

  // Chairs. An empty one is the colour of the room; a taken one takes the
  // table's status colour, so a full four-top reads as four filled chairs.
  chairFill: "#CFC4B1",
  chairBack: "#AD9F88",
  chairEdge: "#9A8B74",
} as const;

export interface StatusTone {
  /** The ring around the table top, and the fill of a taken chair. */
  ring: string;
  /** A wash laid over the wood so the state reads in bright light. */
  fill: string;
  /** Text on that wash. */
  ink: string;
}

export const STATUS_TONES: Record<TableStatus, StatusTone> = {
  available: { ring: colors.separator, fill: colors.card, ink: colors.textSecondary },
  seated: { ring: colors.primary, fill: colors.primaryLight, ink: colors.textPrimary },
  ordered: { ring: colors.warning, fill: colors.warningLight, ink: colors.statusPending.text },
  ready: { ring: colors.success, fill: colors.successLight, ink: colors.statusReady.text },
  billing: { ring: colors.danger, fill: colors.dangerLight, ink: colors.statusCancelled.text },
};

/** How strongly a status washes over the wood. Available leaves it bare. */
export const STATUS_WASH_OPACITY = 0.38;
