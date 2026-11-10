import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { MONO_FONT } from "../receipt/studio-theme";
import { colors, radius, spacing, typography } from "../../theme/colors";

interface SlipPreviewProps {
  /** The slip as plain text, exactly as the printer gets it (slipPlainText). */
  text: string;
  caption?: string;
  testID?: string;
}

/** The paper on screen, in the printer's monospace — what she sees is what prints. */
export function SlipPreview({ text, caption = "This is what prints", testID = "shift-report-paper" }: SlipPreviewProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.caption}>{caption}</Text>
      <View style={styles.paper} testID={testID}>
        <Text style={styles.paperText} selectable>
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  caption: { ...typography.caption, color: colors.textMuted, fontWeight: "600" },
  paper: { backgroundColor: colors.card, borderRadius: radius.sm, padding: spacing.lg, borderWidth: 1, borderColor: colors.separator, alignSelf: "center" },
  paperText: { fontFamily: MONO_FONT, fontSize: 13, lineHeight: 18, color: colors.textPrimary },
});
