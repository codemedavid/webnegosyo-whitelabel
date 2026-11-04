import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import {
  amountLabel,
  resultPill,
  statusLine,
  whoLine,
} from "../../lib/cash/remittance-view";
import type { Remittance } from "../../lib/cash/remittances";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { StaffAvatar } from "../staff/StaffAvatar";
import { VerdictPill } from "../VerdictPill";

interface RemittanceRowProps {
  remittance: Remittance;
  /** Shown only when the viewer may accept it. */
  onAccept?: () => void;
  /** The first row's Accept is primary, the rest secondary (one primary per screen). */
  isFirst: boolean;
  isOffline: boolean;
  onOpen: () => void;
}

const clock = (iso: string): string =>
  new Date(iso).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });

/** Avatar · "Ana · Cashier 1" · "₱6,345 · 2:51 AM" · result pill · Accept. */
export function RemittanceRow({
  remittance,
  onAccept,
  isFirst,
  isOffline,
  onOpen,
}: RemittanceRowProps) {
  const pill = resultPill(remittance);
  const when = remittance.createdAt ? ` · ${clock(remittance.createdAt)}` : "";
  return (
    // Two siblings, not a button inside a button: a screen reader must reach
    // Accept on its own, and the row's own label opens the details.
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.main}
        onPress={onOpen}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${whoLine(remittance)}, ${amountLabel(remittance)}, ${pill.label}. ${statusLine(remittance)}`}
        accessibilityHint="Open the details"
      >
        <StaffAvatar
          name={remittance.cashierName}
          seed={remittance.cashierUserId ?? remittance.id}
          size="md"
        />
        <View style={styles.copy}>
          <Text style={styles.who} numberOfLines={1}>
            {whoLine(remittance)}
          </Text>
          <Text
            style={styles.amount}
          >{`${amountLabel(remittance)}${when}`}</Text>
          <View style={styles.pillRow}>
            <VerdictPill label={pill.label} tone={pill.tone} />
            {remittance.status !== "pending" ? (
              <Text style={styles.meta} numberOfLines={1}>
                {statusLine(remittance)}
              </Text>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
      {onAccept ? (
        <Button
          label="Accept"
          size="sm"
          tone={isFirst ? "primary" : "secondary"}
          onPress={onAccept}
          disabled={isOffline}
          accessibilityLabel={`Accept ${amountLabel(remittance)} from ${remittance.cashierName}`}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    minHeight: 76,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
  },
  main: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  copy: { flex: 1, gap: 3 },
  who: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  amount: {
    ...typography.caption,
    color: colors.textMuted,
    fontVariant: ["tabular-nums"],
  },
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  meta: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
});
