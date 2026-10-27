import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";
import { SegmentedControl } from "../SegmentedControl";
import { StaffAvatar } from "../staff/StaffAvatar";
import { pinBlockedReason, receiverById, type CashReceiver, type RemitHow, type RemitTarget } from "./remit-target";

interface RemitToPickerProps {
  /** Cash managers with reach to this branch; null while loading. */
  receivers: readonly CashReceiver[] | null;
  value: RemitTarget | null;
  onChange: (target: RemitTarget) => void;
  how: RemitHow;
  onHowChange: (how: RemitHow) => void;
  isOffline?: boolean;
  /** The receivers read failed: said plainly, the safe stays available. */
  loadError?: string | null;
  isDisabled?: boolean;
}

const HOW_OPTIONS: readonly { label: string; value: RemitHow }[] = [
  { label: "Send to their phone", value: "phone" },
  { label: "PIN here now", value: "pin" },
];

export const LOADING_LINE = "Finding who can receive cash…";
export const NONE_LINE = "No one here can receive cash yet. Use the store safe, or ask the owner to give someone “Cash & day close”.";

function meta(receiver: CashReceiver): string | null {
  const parts = [receiver.roleLabel, receiver.presence].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}

interface ChoiceRowProps {
  title: string;
  subtitle?: string | null;
  leading: React.ReactNode;
  isSelected: boolean;
  isDisabled: boolean;
  onPress: () => void;
  testID: string;
}

function ChoiceRow({ title, subtitle, leading, isSelected, isDisabled, onPress, testID }: ChoiceRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={[styles.row, isSelected && styles.rowSelected]}
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected, disabled: isDisabled }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      testID={testID}
    >
      {leading}
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.rowMeta}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.radio, isSelected && styles.radioOn]}>{isSelected ? <View style={styles.radioDot} /> : null}</View>
    </Pressable>
  );
}

function SafeOpeners({ receivers, openerUserId, onPick }: { receivers: readonly CashReceiver[]; openerUserId: string | null; onPick: (id: string | null) => void }) {
  if (receivers.length === 0) return null;
  return (
    <View style={styles.openers}>
      <Text style={styles.subheading}>Who will open the safe?</Text>
      <View style={styles.chips}>
        {receivers.map((receiver) => {
          const isOn = receiver.userId === openerUserId;
          return (
            <Pressable
              key={receiver.userId}
              onPress={() => onPick(isOn ? null : receiver.userId)}
              style={[styles.chip, isOn && styles.chipOn]}
              accessibilityRole="radio"
              accessibilityState={{ checked: isOn }}
              accessibilityLabel={`${receiver.name} opens the safe`}
              testID={`safe-opener-${receiver.userId}`}
            >
              <Text style={[styles.chipText, isOn && styles.chipTextOn]}>{receiver.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function StatusLine({ receivers, loadError }: { receivers: readonly CashReceiver[] | null; loadError: string | null }) {
  if (loadError) return <Text style={styles.error}>{loadError}</Text>;
  if (receivers === null) return <Text style={styles.note}>{LOADING_LINE}</Text>;
  if (receivers.length === 0) return <Text style={styles.note}>{NONE_LINE}</Text>;
  return null;
}

/**
 * "Who is receiving it?" — receivers in this branch (avatar, name, role,
 * presence), then the store safe; for a person, "Send to their phone" or "PIN
 * here now". PIN here now is refused, with the reason, when it can't work
 * (offline, no PIN set) rather than failing after the cashier waits.
 */
export function RemitToPicker({ receivers, value, onChange, how, onHowChange, isOffline = false, loadError = null, isDisabled = false }: RemitToPickerProps) {
  const person = value?.kind === "person" ? receiverById(receivers, value.userId) : null;
  const blocked = person ? pinBlockedReason(person, isOffline) : null;

  const pickPerson = (receiver: CashReceiver) => {
    onChange({ kind: "person", userId: receiver.userId });
    if (how === "pin" && pinBlockedReason(receiver, isOffline)) onHowChange("phone");
  };
  const changeHow = (next: RemitHow) => {
    if (next === "pin" && blocked) return;
    onHowChange(next);
  };

  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" testID="remit-to-picker">
      <Text style={styles.heading} accessibilityRole="header">
        Who is receiving it?
      </Text>
      <StatusLine receivers={receivers} loadError={loadError} />
      {(receivers ?? []).map((receiver) => (
        <ChoiceRow
          key={receiver.userId}
          title={receiver.name}
          subtitle={meta(receiver)}
          leading={<StaffAvatar name={receiver.name} seed={receiver.userId} size="sm" />}
          isSelected={value?.kind === "person" && value.userId === receiver.userId}
          isDisabled={isDisabled}
          onPress={() => pickPerson(receiver)}
          testID={`remit-to-${receiver.userId}`}
        />
      ))}
      <ChoiceRow
        title="Store safe"
        subtitle="Drop safe"
        leading={
          <View style={styles.safeIcon}>
            <Icon name="lock" size={18} color={colors.textPrimary} />
          </View>
        }
        isSelected={value?.kind === "safe"}
        isDisabled={isDisabled}
        onPress={() => onChange({ kind: "safe", openerUserId: value?.kind === "safe" ? value.openerUserId : null })}
        testID="remit-to-safe"
      />
      {value?.kind === "person" && person ? (
        <View style={styles.how}>
          <SegmentedControl options={HOW_OPTIONS} value={how} onChange={changeHow} accessibilityPrefix="How" />
          {blocked ? <Text style={styles.note}>{blocked}</Text> : null}
        </View>
      ) : null}
      {value?.kind === "safe" ? (
        <SafeOpeners receivers={receivers ?? []} openerUserId={value.openerUserId} onPick={(id) => onChange({ kind: "safe", openerUserId: id })} />
      ) : null}
    </View>
  );
}

const AVATAR = 36;

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  heading: { ...typography.heading, color: colors.textPrimary },
  subheading: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.separator,
  },
  rowSelected: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  rowMeta: { ...typography.caption, color: colors.textMuted },
  radio: { width: 22, height: 22, borderRadius: radius.full, borderWidth: 2, borderColor: colors.separator, alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: radius.full, backgroundColor: colors.accent },
  safeIcon: { width: AVATAR, height: AVATAR, borderRadius: radius.full, backgroundColor: colors.surfaceSubtle, alignItems: "center", justifyContent: "center" },
  how: { gap: spacing.xs, marginTop: spacing.xs },
  openers: { gap: spacing.sm, marginTop: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.full, borderWidth: 1, borderColor: colors.separator, backgroundColor: colors.card, justifyContent: "center" },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  chipTextOn: { color: colors.textOnDark },
  note: { ...typography.caption, color: colors.textMuted },
  error: { ...typography.caption, color: colors.danger, fontWeight: "600" },
});
