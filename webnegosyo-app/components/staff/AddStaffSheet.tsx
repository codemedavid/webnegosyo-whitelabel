import React, { useMemo, useState } from "react";
import { Modal, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { isTabAllowed } from "../../lib/staff-permissions";
import { PERMISSION_OPTIONS, PINNABLE_SCREENS } from "../../lib/team-roster";
import { togglePermission } from "../../lib/team-permissions";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { IconButton } from "../IconButton";
import { OptionPills } from "../OptionPills";
import { SectionHeader } from "../SectionHeader";

/**
 * Adding a colleague, as one deliberate act.
 *
 * A sheet rather than a block that unfolds inside the roster: creating an
 * account asks eight questions, and answering them halfway down a scrolling
 * list of other people meant the owner lost their place every time the
 * keyboard opened.
 *
 * The screen that owns it decides what happens on submit — this is a form,
 * not a client of the staff service.
 */

const MIN_PASSWORD_LENGTH = 8;

export interface NewStaffDraft {
  email: string;
  password: string;
  displayName: string;
  permissions: string[];
  outletId: string | null;
  defaultTab: string | null;
}

const EMPTY_DRAFT: NewStaffDraft = {
  email: "",
  password: "",
  displayName: "",
  permissions: [],
  outletId: null,
  defaultTab: null,
};

export interface AddStaffSheetProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (draft: NewStaffDraft) => void;
  busy: boolean;
  outlets: readonly { id: string; name: string }[];
  /** Only the owner picks the branch; a branch admin fills their own. */
  canAssignBranch: boolean;
  /** Named so a branch admin can see which branch they are filling. */
  branchName: string;
}

export function AddStaffSheet({
  visible,
  onClose,
  onCreate,
  busy,
  outlets,
  canAssignBranch,
  branchName,
}: AddStaffSheetProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<NewStaffDraft>(EMPTY_DRAFT);

  // Offered against the grants being handed out in this same submission —
  // unticking a permission must drop the screen it was the key to, or the
  // form submits a choice the service is about to reject.
  const screens = useMemo(() => {
    const holder = { role: "admin", isOwner: false, permissions: draft.permissions };
    return PINNABLE_SCREENS.filter((screen) => isTabAllowed(holder, screen.tab));
  }, [draft.permissions]);

  const isComplete =
    draft.email.trim().length > 0 &&
    draft.displayName.trim().length > 0 &&
    draft.password.length >= MIN_PASSWORD_LENGTH &&
    draft.permissions.length > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.header}>
          <IconButton icon="close" label="Close" onPress={onClose} />
          <View style={styles.headerCopy}>
            <Text style={styles.title}>New staff account</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {canAssignBranch ? "They log in on the app, the POS and the web admin" : `Joining ${branchName}`}
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <TextInput
              style={styles.input}
              placeholder="Display name"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="Display name"
              value={draft.displayName}
              onChangeText={(displayName) => setDraft((current) => ({ ...current, displayName }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              keyboardType="email-address"
              accessibilityLabel="Email"
              value={draft.email}
              onChangeText={(email) => setDraft((current) => ({ ...current, email }))}
            />
            <TextInput
              style={styles.input}
              placeholder={`Password (min ${MIN_PASSWORD_LENGTH} characters)`}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              secureTextEntry
              accessibilityLabel="Password"
              value={draft.password}
              onChangeText={(password) => setDraft((current) => ({ ...current, password }))}
            />
          </View>

          <View style={styles.card}>
            <SectionHeader title="Can access" hint="Pick at least one. You can change this later." />
            {PERMISSION_OPTIONS.map((option) => (
              <View key={option.key} style={styles.row}>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowLabel}>{option.label}</Text>
                  <Text style={styles.rowHint}>{option.description}</Text>
                </View>
                <Switch
                  accessibilityLabel={option.label}
                  value={draft.permissions.includes(option.key)}
                  onValueChange={() =>
                    setDraft((current) => {
                      const permissions = togglePermission(current.permissions, option.key);
                      const holder = { role: "admin", isOwner: false, permissions };
                      const keepsScreen =
                        current.defaultTab === null || isTabAllowed(holder, current.defaultTab);
                      return {
                        ...current,
                        permissions,
                        defaultTab: keepsScreen ? current.defaultTab : null,
                      };
                    })
                  }
                />
              </View>
            ))}
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
                isSelected={(value) => value === draft.outletId}
                onSelect={(outletId) => setDraft((current) => ({ ...current, outletId }))}
              />
            </View>
          ) : null}

          <View style={styles.card}>
            <SectionHeader title="Opens on" hint="The screen this account sees first in the app." />
            <OptionPills<string | null>
              accessibilityPrefix="Opens on"
              options={[
                { label: "Let the app decide", value: null },
                ...screens.map((screen) => ({ label: screen.label, value: screen.tab })),
              ]}
              isSelected={(value) => value === draft.defaultTab}
              onSelect={(defaultTab) => setDraft((current) => ({ ...current, defaultTab }))}
            />
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button
            label="Create account"
            isLoading={busy}
            disabled={busy || !isComplete}
            onPress={() => {
              onCreate(draft);
              setDraft(EMPTY_DRAFT);
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  headerCopy: { flex: 1, gap: 2 },
  title: { ...typography.title, fontSize: 20, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary },
  content: { padding: spacing.xl, paddingTop: 0, gap: spacing.sm },
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
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    backgroundColor: colors.background,
  },
});
