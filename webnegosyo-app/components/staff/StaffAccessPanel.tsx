import React, { useState } from "react";
import { StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { impliedPermissions, isTabAllowed } from "../../lib/staff-permissions";
import type { StaffMember } from "../../lib/staff-service";
import {
  containingGrantLabel,
  PERMISSION_OPTIONS,
  PINNABLE_SCREENS,
} from "../../lib/team-roster";
import { effectivePermissions, toggleEffectivePermission } from "../../lib/team-permissions";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { OptionPills } from "../OptionPills";
import { SectionHeader } from "../SectionHeader";

/**
 * Everything that can be done TO this account, on the screen about them.
 *
 * Presentation only: every write is a callback the screen fulfils through
 * `lib/staff-service`, which is the one place that talks to the manage-staff
 * edge function. The phone never holds the service-role key and the server
 * re-derives the caller's authority from the JWT, so what this panel decides
 * is what to OFFER, never what is allowed.
 *
 * Switches save on flip rather than behind a Save button: on a phone, a form
 * you must remember to submit is a form whose changes get lost when the
 * merchant is called back to the counter.
 */

const MIN_PASSWORD_LENGTH = 8;

/** Screens the picker should offer for the grants this account actually holds. */
function pinnableFor(permissions: string[] | null) {
  const holder = { role: "admin", isOwner: false, permissions };
  return PINNABLE_SCREENS.filter((screen) => isTabAllowed(holder, screen.tab));
}

export interface StaffAccessPanelProps {
  member: StaffMember;
  outlets: readonly { id: string; name: string }[];
  /** Only the owner may move an account between branches. */
  canAssignBranch: boolean;
  busy: boolean;
  onUpdatePermissions: (next: string[]) => void;
  onUpdateBranch: (outletId: string | null) => void;
  onUpdateDefaultScreen: (tab: string | null) => void;
  onResetPassword: (password: string) => void;
  onRemove: () => void;
  /** Reported when a flip would leave the account with nothing at all. */
  onRefuseEmptyPermissions: () => void;
}

export function StaffAccessPanel({
  member,
  outlets,
  canAssignBranch,
  busy,
  onUpdatePermissions,
  onUpdateBranch,
  onUpdateDefaultScreen,
  onResetPassword,
  onRemove,
  onRefuseEmptyPermissions,
}: StaffAccessPanelProps) {
  const [password, setPassword] = useState("");
  const held = effectivePermissions(member.permissions);
  // Grants this account reaches through a broader one it holds. Drawn on and
  // locked, so the switches say the same thing the app does.
  const included = impliedPermissions(member.permissions);

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <SectionHeader title="Can access" hint="Saved as you switch it. Applies next time they open the app." />
        {PERMISSION_OPTIONS.map((option) => {
          const isIncluded = included.includes(option.key);
          return (
            <View key={option.key} style={styles.row}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowLabel}>{option.label}</Text>
                <Text style={styles.rowHint}>
                  {isIncluded
                    ? `Included with ${containingGrantLabel(option.key)}`
                    : option.description}
                </Text>
              </View>
              <Switch
                value={isIncluded || held.includes(option.key)}
                disabled={busy || isIncluded}
                accessibilityLabel={option.label}
                onValueChange={() => {
                  // null = full access: every switch is on, and a flip must send
                  // the whole list minus this key, not just this key.
                  const next = toggleEffectivePermission(member.permissions, option.key);
                  if (next.length === 0) {
                    onRefuseEmptyPermissions();
                    return;
                  }
                  onUpdatePermissions(next);
                }}
              />
            </View>
          );
        })}
      </View>

      {canAssignBranch && outlets.length > 0 ? (
        <View style={styles.card}>
          <SectionHeader title="Works at" hint="A branch account sees only that branch's orders and sales." />
          <OptionPills<string | null>
            accessibilityPrefix="Works at"
            options={[
              { label: "Whole store", value: null },
              ...outlets.map((outlet) => ({ label: outlet.name, value: outlet.id })),
            ]}
            isSelected={(value) => value === member.outletId}
            onSelect={(value) => {
              if (busy) return;
              onUpdateBranch(value);
            }}
          />
        </View>
      ) : null}

      <View style={styles.card}>
        <SectionHeader title="Opens on" hint="The screen this account sees first. Only screens their permissions allow." />
        <OptionPills<string | null>
          accessibilityPrefix="Opens on"
          options={[
            { label: "Let the app decide", value: null },
            ...pinnableFor(member.permissions).map((screen) => ({
              label: screen.label,
              value: screen.tab,
            })),
          ]}
          isSelected={(value) => value === member.defaultTab}
          onSelect={(value) => {
            if (busy) return;
            onUpdateDefaultScreen(value);
          }}
        />
      </View>

      <View style={styles.card}>
        <SectionHeader title="Password" hint="Takes effect immediately — tell them the new one." />
        <TextInput
          style={styles.input}
          placeholder={`New password (min ${MIN_PASSWORD_LENGTH} characters)`}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          secureTextEntry
          accessibilityLabel="New password"
          value={password}
          onChangeText={setPassword}
        />
        <Button
          label="Set new password"
          tone="secondary"
          disabled={busy || password.length < MIN_PASSWORD_LENGTH}
          onPress={() => {
            onResetPassword(password);
            setPassword("");
          }}
        />
      </View>

      <View style={styles.card}>
        <SectionHeader
          title="Remove access"
          hint="Deletes the account. Their past orders and shifts stay on the record."
        />
        <Button label="Remove account" tone="danger" disabled={busy} onPress={onRemove} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowCopy: { flex: 1, gap: 2 },
  rowLabel: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  rowHint: { ...typography.small, color: colors.textSecondary },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceSubtle,
  },
});
