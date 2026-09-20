import React, { useMemo } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";

import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { buildQrModules } from "../../lib/tables/table-qr";

interface TableQrCardProps {
  label: string;
  url: string;
  /** Edge length of the drawn code, in points. */
  size?: number;
}

const DEFAULT_SIZE = 220;

/**
 * The code that goes on the table. Scanning it opens the menu with this
 * table already filled in, so an order from that phone names the table.
 */
export function TableQrCard({ label, url, size = DEFAULT_SIZE }: TableQrCardProps) {
  const modules = useMemo(() => buildQrModules(url), [url]);
  const cell = modules ? size / modules.size : 0;

  const share = () => {
    void Share.share({ message: `Table ${label}: ${url}`, url });
  };

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Scan to order</Text>
      <Text style={styles.label}>Table {label}</Text>
      {modules ? (
        <View style={styles.codeFrame} accessibilityLabel={`QR code for table ${label}`} testID="table-qr">
          <Svg width={size} height={size}>
            {modules.dark.flatMap((row, r) =>
              row.map((isDark, c) =>
                isDark ? (
                  <Rect
                    key={`${r}-${c}`}
                    x={c * cell}
                    y={r * cell}
                    width={cell + 0.2}
                    height={cell + 0.2}
                    fill={colors.textPrimary}
                  />
                ) : null,
              ),
            )}
          </Svg>
        </View>
      ) : (
        <Text style={styles.fallback}>This link is too long to draw as a code. Share it instead.</Text>
      )}
      <Text style={styles.url} numberOfLines={2} selectable>
        {url}
      </Text>
      <Button label="Share link" icon="export" tone="secondary" onPress={share} fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    ...shadow.sm,
  },
  eyebrow: { ...typography.eyebrow, color: colors.textSecondary },
  label: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: colors.textPrimary },
  codeFrame: { padding: spacing.sm, backgroundColor: colors.card, borderRadius: radius.md },
  fallback: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
  url: { ...typography.small, color: colors.textSecondary, textAlign: "center" },
});
