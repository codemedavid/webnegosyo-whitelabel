import { Platform } from "react-native";
import { colors } from "../../theme/colors";

/**
 * The Receipt editor's surfaces.
 *
 * The editor is the one screen where the product is a physical object: white
 * thermal paper. On the app's cream canvas white paper has nothing to stand
 * against, so the editor sits on the dark ink the dashboard's hero card
 * already uses — the colour of the printer's own body — and the paper hangs
 * from a slot at the top the way it leaves the head. The controls stay on the
 * app's cream, so everything the merchant touches looks like the rest of the
 * app and only the receipt looks like a receipt.
 *
 * Selection is the app's coral accent: on white paper it is the one colour
 * that cannot be mistaken for ink.
 */
export const studio = {
  canvas: colors.heroInk,
  canvasRaised: colors.heroInkElevated,
  canvasText: colors.heroInkText,
  canvasMuted: colors.heroInkMuted,
  canvasHairline: "rgba(253,251,247,0.10)",
  slot: "#0E0B09",
  slotLip: "#3A3029",

  paper: "#FFFFFF",
  /** Thermal print is never pure black; this is the head's near-black. */
  paperInk: "#17130F",
  paperFaint: "#A39C90",
  paperHairline: "#E7E2D8",

  select: colors.accent,
  selectTint: "rgba(228,87,46,0.07)",
  selectText: colors.textOnDark,

  dirty: colors.warning,
  live: "#34D399",
} as const;

/** The receipt's typeface: the platform's own monospace, as the printer's font A is. */
export const MONO_FONT = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

/** Line height as a share of the font size — thermal font A leaves ~1/3 leading. */
export const PAPER_LINE_RATIO = 1.34;
