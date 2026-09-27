import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from "react-native";

import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import {
  STATUS_PRESENTATION,
  describeScope,
  describeWindow,
  discountHeadline,
  usageProgress,
  voucherStatus,
  type StatusTone,
} from "../../lib/voucher-admin/voucher-status";
import type { Voucher } from "../../lib/vouchers/types";

/**
 * A voucher drawn as the thing it is: a ticket.
 *
 * The deal sits on the stub in type big enough to read at arm's length —
 * "20% OFF" is the first thing a merchant scanning the list is looking for —
 * and the code, the status and how much of it is left sit on the body. The
 * list and the editor's live preview draw the same component, so what the
 * merchant sees while typing is exactly the card they will find afterwards.
 */

interface VoucherTicketProps {
  voucher: Voucher;
  now: Date;
  onPress?: () => void;
  /** Right-hand control, e.g. the on/off switch on the list. */
  trailing?: React.ReactNode;
  /** Shown in place of an empty code, for the editor preview. */
  codePlaceholder?: string;
  style?: ViewStyle;
  testID?: string;
}

const STUB_WIDTH = 96;
const NOTCH_SIZE = 16;
const PERFORATION_DOTS = 6;

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: undefined });

const STUB_PALETTE: Record<StatusTone, { bg: string; fg: string; muted: string }> = {
  success: { bg: colors.primary, fg: colors.textOnDark, muted: colors.heroInkMuted },
  info: { bg: colors.infoLight, fg: colors.textPrimary, muted: colors.info },
  warning: { bg: colors.warningLight, fg: colors.statusPending.text, muted: colors.statusPending.text },
  muted: { bg: colors.surfaceSubtle, fg: colors.textSecondary, muted: colors.textSecondary },
};

const PILL_PALETTE: Record<StatusTone, { bg: string; fg: string }> = {
  success: { bg: colors.successLight, fg: colors.success },
  info: { bg: colors.infoLight, fg: colors.statusConfirmed.text },
  warning: { bg: colors.warningLight, fg: colors.statusPending.text },
  muted: { bg: colors.surfaceSubtle, fg: colors.textSecondary },
};

export function VoucherStatusPill({ voucher, now }: { voucher: Voucher; now: Date }) {
  const { label, tone } = STATUS_PRESENTATION[voucherStatus(voucher, now)];
  const palette = PILL_PALETTE[tone];
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      {tone === "success" ? <View style={[styles.pillDot, { backgroundColor: palette.fg }]} /> : null}
      <Text style={[styles.pillText, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

export function VoucherTicket({
  voucher,
  now,
  onPress,
  trailing,
  codePlaceholder = "CODE",
  style,
  testID,
}: VoucherTicketProps) {
  const status = voucherStatus(voucher, now);
  const { tone, label } = STATUS_PRESENTATION[status];
  const stub = STUB_PALETTE[tone];
  const headline = discountHeadline(voucher);
  const usage = usageProgress(voucher);
  const window = describeWindow(voucher, now);
  const meta = [describeScope(voucher), window].filter(Boolean).join(" · ");
  const hasCode = voucher.code.trim() !== "";

  const body = (
    <View style={[styles.ticket, style]} testID={testID}>
      <View style={[styles.stub, { backgroundColor: stub.bg }]}>
        <Text
          style={[styles.value, { color: stub.fg }, headline.value.length > 5 && styles.valueLong]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {headline.value}
        </Text>
        <Text style={[styles.unit, { color: stub.muted }]}>{headline.unit}</Text>
      </View>

      <View style={styles.perforation} pointerEvents="none">
        <View style={[styles.notch, styles.notchTop]} />
        <View style={styles.dots}>
          {Array.from({ length: PERFORATION_DOTS }, (_, i) => (
            <View key={i} style={styles.dot} />
          ))}
        </View>
        <View style={[styles.notch, styles.notchBottom]} />
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text
            style={[styles.code, !hasCode && styles.codePlaceholder]}
            numberOfLines={1}
            accessibilityLabel={hasCode ? `Code ${voucher.code.split("").join(" ")}` : "No code yet"}
          >
            {hasCode ? voucher.code : codePlaceholder}
          </Text>
          <VoucherStatusPill voucher={voucher} now={now} />
        </View>
        {voucher.name.trim() !== "" ? (
          <Text style={styles.name} numberOfLines={1}>
            {voucher.name}
          </Text>
        ) : null}
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>

        {usage.ratio !== null ? (
          <View style={styles.usage} accessibilityLabel={`${usage.used} of ${usage.limit} used`}>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  { width: `${Math.max(usage.ratio * 100, usage.used > 0 ? 4 : 0)}%` },
                  usage.remaining === 0 && styles.fillSpent,
                ]}
              />
            </View>
            <Text style={styles.usageText}>
              {usage.remaining === 0 ? "All used" : `${usage.remaining} left`}
            </Text>
          </View>
        ) : (
          <Text style={styles.usageText}>
            {usage.used === 0 ? "Not used yet" : `Used ${usage.used} ${usage.used === 1 ? "time" : "times"}`}
          </Text>
        )}
      </View>

      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${voucher.code || "New voucher"}, ${headline.value} ${headline.unit.toLowerCase()}, ${label}`}
      accessibilityHint="Opens the voucher"
    >
      {body}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  ticket: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    minHeight: 112,
    ...shadow.sm,
  },
  stub: {
    width: STUB_WIDTH,
    borderTopLeftRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  value: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  valueLong: { fontSize: 20 },
  unit: { ...typography.eyebrow, marginTop: 2 },

  // The seam: a half-circle bitten out of the top and bottom edge, with a
  // dotted tear line between them, in the canvas colour so it reads as a hole.
  perforation: {
    position: "absolute",
    left: STUB_WIDTH - NOTCH_SIZE / 2,
    top: 0,
    bottom: 0,
    width: NOTCH_SIZE,
    alignItems: "center",
    justifyContent: "space-between",
  },
  notch: {
    width: NOTCH_SIZE,
    height: NOTCH_SIZE,
    borderRadius: NOTCH_SIZE / 2,
    backgroundColor: colors.background,
  },
  notchTop: { marginTop: -NOTCH_SIZE / 2 },
  notchBottom: { marginBottom: -NOTCH_SIZE / 2 },
  dots: { flex: 1, justifyContent: "space-evenly", paddingVertical: spacing.xs },
  dot: { width: 2, height: 5, borderRadius: 1, backgroundColor: colors.separator },

  body: {
    flex: 1,
    paddingLeft: spacing.lg + NOTCH_SIZE / 2,
    paddingRight: spacing.lg,
    paddingVertical: spacing.md,
    justifyContent: "center",
    gap: 3,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  code: {
    flex: 1,
    fontFamily: MONO,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.textPrimary,
  },
  codePlaceholder: { color: colors.textTertiary },
  name: { ...typography.caption, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary },

  usage: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 4 },
  track: {
    flex: 1,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: radius.full, backgroundColor: colors.success },
  fillSpent: { backgroundColor: colors.warning },
  usageText: { ...typography.small, color: colors.textSecondary, fontWeight: "600", marginTop: 2 },

  trailing: { justifyContent: "center", paddingRight: spacing.md },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: "700" },
});
