import { StyleSheet } from "react-native";
import { WELCOME_COLORS } from "../../lib/welcome/slides";

/**
 * Scenes are drawn on a fixed 358 × 448 stage and scaled to the panel
 * (WelcomeScreen), so every phone and tablet shows the same composition.
 */
export const STAGE = { width: 358, height: 448 } as const;

export const sceneStyles = StyleSheet.create({
  stage: { width: STAGE.width, height: STAGE.height },
  card: {
    position: "absolute",
    left: 28,
    right: 28,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 18,
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  label: { fontSize: 13, fontWeight: "700", color: "#6B6B6B" },
  bigNumber: { fontSize: 42, lineHeight: 48, fontWeight: "800", letterSpacing: -1.4, color: WELCOME_COLORS.ink },
  rowTitle: { fontSize: 14, fontWeight: "700", color: WELCOME_COLORS.ink },
  rowStrong: { fontSize: 14, fontWeight: "800", color: WELCOME_COLORS.ink },
  rowMeta: { fontSize: 12, fontWeight: "700", color: "#6B6B6B" },
  pill: {
    position: "absolute",
    left: 28,
    right: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF1E6",
  },
});
