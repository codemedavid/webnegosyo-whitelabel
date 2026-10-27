import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { GOV_DISCOUNT_RULES, type GovDiscountKind } from "../../lib/gov-discount";
import { MANDATORY_GOV_KINDS, OPTIONAL_GOV_KINDS, toggleKind } from "../../lib/tax-settings/form";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";
import { Note, SettingsCard, SwitchRow } from "./parts";
import type { TaxSectionProps } from "./RegistrationSection";

const ONLINE_CLAIMS_HINT =
  "Off: customers ask at the counter or when their order arrives, and your staff apply it on the register after seeing the ID. On: customers type their ID number at online checkout and the discount comes off right away.";

function LockedKindRow({ kind }: { kind: GovDiscountKind }) {
  const rule = GOV_DISCOUNT_RULES[kind];
  return (
    <View style={styles.locked} accessible accessibilityLabel={`${rule.label}, ${rule.ratePercent}% off, always on`}>
      <View style={styles.lockedCopy}>
        <Text style={styles.kindTitle}>
          {rule.label} <Text style={styles.kindMeta}>· {rule.ratePercent}% off</Text>
        </Text>
        <Text style={styles.kindMeta}>{rule.law}</Text>
      </View>
      <View style={styles.badge}>
        <Icon name="check" size={12} color={colors.textPrimary} />
        <Text style={styles.badgeText}>Always on</Text>
      </View>
    </View>
  );
}

/** Senior/PWD locked on; the optional kinds as switches; the shared-table and online-claim rules. */
export function DiscountsSection({ form, onChange, disabled }: TaxSectionProps) {
  return (
    <SettingsCard title="Discounts you offer" description="These show as buttons on the register.">
      <View style={styles.group}>
        {MANDATORY_GOV_KINDS.map((kind) => (
          <LockedKindRow key={kind} kind={kind} />
        ))}
      </View>
      <Note>
        The law requires these, so they can’t be switched off. Refusing a Senior Citizen or PWD discount is a
        crime under RA 9994 and RA 10754.
      </Note>

      <Text style={styles.subhead}>Optional</Text>
      {OPTIONAL_GOV_KINDS.map((kind) => {
        const rule = GOV_DISCOUNT_RULES[kind];
        return (
          <View key={kind} style={styles.optional}>
            <SwitchRow
              label={rule.label}
              hint={`${rule.ratePercent}% off · ${rule.law}`}
              value={form.enabledKinds.includes(kind)}
              onChange={(isOn) => onChange({ enabledKinds: toggleKind(form.enabledKinds, kind, isOn) })}
              disabled={disabled}
            />
            {rule.caution ? (
              <Note icon="warning" tone="warning">
                {rule.caution}
              </Note>
            ) : null}
          </View>
        );
      })}

      <SwitchRow
        label="Allow splitting a shared table (pro-rata)"
        hint="When food is shared, a senior or PWD gets 20% off their equal share: the shared food divided by everyone at the table. Turn off to discount only what they ordered for themselves."
        value={form.allowSharedTable}
        onChange={(allowSharedTable) => onChange({ allowSharedTable })}
        disabled={disabled}
      />

      <SwitchRow
        label="Let customers claim it when ordering online"
        hint={ONLINE_CLAIMS_HINT}
        value={form.onlineClaimsEnabled}
        onChange={(onlineClaimsEnabled) => onChange({ onlineClaimsEnabled })}
        disabled={disabled}
      />
    </SettingsCard>
  );
}

const styles = StyleSheet.create({
  group: { borderWidth: 1, borderColor: colors.separator, borderRadius: radius.md, overflow: "hidden" },
  locked: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  lockedCopy: { flex: 1 },
  kindTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  kindMeta: { ...typography.caption, fontWeight: "400", color: colors.textSecondary },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  badgeText: { ...typography.small, fontWeight: "700", color: colors.textPrimary },
  subhead: { ...typography.caption, fontWeight: "700", color: colors.textPrimary, marginTop: spacing.xs },
  optional: { gap: spacing.sm },
});
