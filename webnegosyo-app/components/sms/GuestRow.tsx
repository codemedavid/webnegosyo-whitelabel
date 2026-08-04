import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Icon } from "../Icon";
import { avatarIndexFor, initialsOf } from "../../lib/sms/avatar";
import type { CustomerRow, ReachabilityStatus } from "../../lib/sms/customer-list";
import type { ConsentAction } from "../../lib/sms/consent-actions";
import { colors, radius, spacing, typography } from "../../theme/colors";

/**
 * One guest, as a row in a roster.
 *
 * It used to be a bordered white card, one per guest, stacked on the cream
 * canvas. Several hundred identical cards is not a hierarchy, it is a wall —
 * and on a 390px screen it costs a border, a radius and 8px of gutter per
 * guest to say nothing. This is a row on a single shared surface, separated by
 * a hairline, which is what a list of people has always been.
 *
 * The reachability tone is a dot and a word, not a filled pill. A pill on every
 * one of several hundred rows is not emphasis; it is a second colour field
 * competing with the reach bar that already stated these totals.
 */

const TONES: Record<ReachabilityStatus, string> = {
  textable: colors.success,
  no_consent: colors.warning,
  opted_out: colors.textSecondary,
  suppressed: colors.danger,
  no_phone: colors.textTertiary,
};

function peso(amount: number): string {
  return `₱${Math.round(amount).toLocaleString("en-PH")}`;
}

function lastOrderLabel(iso: string | null): string {
  if (!iso) return "No orders yet";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "No orders yet";
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

interface GuestRowProps {
  row: CustomerRow;
  consentAction: ConsentAction;
  onToggleOptOut: () => void;
  onRecordConsent: (action: ConsentAction) => void;
}

export function GuestRow({
  row,
  consentAction,
  onToggleOptOut,
  onRecordConsent,
}: GuestRowProps) {
  const { customer, reachability } = row;
  const tone = TONES[reachability.status];
  const ring = colors.avatarPalette[avatarIndexFor(customer.id, colors.avatarPalette.length)];
  const isRecordable = consentAction.isEnabled && consentAction.kind === "record";

  return (
    <View style={styles.row}>
      <View style={styles.lead}>
        {/*
          The tone lives in the ring, not in a filled circle. Two of the six
          palette colours are light enough that white initials on them land
          near 2:1 — this way the initials are always ink on near-white and the
          colour still does its only job, which is telling rows apart.
        */}
        <View style={[styles.avatar, { borderColor: ring }]}>
          <Text style={styles.initials}>{initialsOf(customer.name)}</Text>
        </View>

        <View style={styles.identity}>
          <Text style={styles.name} numberOfLines={1}>
            {customer.name?.trim() || "Unnamed guest"}
          </Text>
          <Text style={styles.phone} numberOfLines={1}>
            {customer.phone_e164 ?? "No phone number"}
          </Text>
        </View>

        <View style={styles.state}>
          <View style={[styles.dot, { backgroundColor: tone }]} />
          <Text style={styles.stateLabel}>{reachability.label}</Text>
        </View>
      </View>

      <Text style={styles.metrics} numberOfLines={1}>
        {customer.order_count} {customer.order_count === 1 ? "order" : "orders"}
        {"  ·  "}
        {peso(customer.total_spent)}
        {"  ·  "}
        {lastOrderLabel(customer.last_order_at)}
      </Text>

      {(consentAction.isEnabled || customer.phone_e164) && (
        <View style={styles.actions}>
          {/*
            Recording consent is the one action on this screen that moves the
            reach bar, so it is the only one shaped like a button. Undoing it
            is a correction, and corrections are quiet.
          */}
          {isRecordable && (
            <TouchableOpacity
              style={styles.record}
              onPress={() => onRecordConsent(consentAction)}
              accessibilityRole="button"
            >
              <Icon name="check" color={colors.success} size={13} strokeWidth={2.5} />
              <Text style={styles.recordText}>{consentAction.label}</Text>
            </TouchableOpacity>
          )}

          {consentAction.isEnabled && !isRecordable && (
            <TouchableOpacity
              onPress={() => onRecordConsent(consentAction)}
              accessibilityRole="button"
            >
              <Text style={styles.quiet}>{consentAction.label}</Text>
            </TouchableOpacity>
          )}

          {customer.phone_e164 && (
            <TouchableOpacity onPress={onToggleOptOut} accessibilityRole="button">
              <Text style={customer.sms_opt_out ? styles.quietStrong : styles.quiet}>
                {customer.sms_opt_out ? "Allow texts again" : "Do not text"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const AVATAR = 42;

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 6 },
  lead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 2,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  identity: { flex: 1, gap: 1 },
  name: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  phone: { ...typography.caption, color: colors.textSecondary },
  state: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  stateLabel: { ...typography.small, color: colors.textPrimary, fontWeight: "600" },
  // Indented to the identity column, so the eye reads name → detail down one
  // edge rather than tracking back to the avatar.
  metrics: {
    ...typography.small,
    color: colors.textSecondary,
    marginLeft: AVATAR + spacing.md,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.md,
    marginLeft: AVATAR + spacing.md,
    marginTop: 2,
  },
  record: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.successLight,
  },
  recordText: { ...typography.caption, color: colors.success, fontWeight: "700" },
  quiet: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
  quietStrong: { ...typography.caption, color: colors.accent, fontWeight: "700" },
});
