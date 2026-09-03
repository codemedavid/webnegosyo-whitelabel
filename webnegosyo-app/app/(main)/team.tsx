import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../stores/auth-store";
import { useOutlets } from "../../lib/use-outlets";
import {
  canOpenTeam,
  createStaff,
  listStaff,
  removeStaff,
  resetStaffPassword,
  updateStaffBranch,
  updateStaffDefaultScreen,
  updateStaffPermissions,
  type ManageStaffInvoke,
  type StaffMember,
} from "../../lib/staff-service";
import { isTabAllowed } from "../../lib/staff-permissions";
import { BackHeader } from "../../components/BackHeader";
import {
  PERMISSION_OPTIONS,
  PINNABLE_SCREENS,
  describePermissions,
} from "../../lib/team-roster";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { Card } from "../../components/Card";

// Team management: the owner's roster on the phone. Every write goes through
// the manage-staff edge function (lib/staff-service.ts) — the phone never
// holds the service-role key, and the server re-derives the caller's tenant
// and authority from the JWT, so this screen is presentation only.

const invokeManageStaff: ManageStaffInvoke = (body) =>
  supabase.functions.invoke("manage-staff", { method: "POST", body });

const MIN_PASSWORD_LENGTH = 8;

interface NewStaffForm {
  email: string;
  password: string;
  displayName: string;
  permissions: string[];
  outletId: string | null;
  defaultTab: string | null;
}

const EMPTY_FORM: NewStaffForm = {
  email: "",
  password: "",
  displayName: "",
  permissions: [],
  outletId: null,
  defaultTab: null,
};

function togglePermission(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

/** Screens the picker should offer for this grant list. */
function pinnableFor(permissions: string[] | null) {
  const holder = { role: "admin", isOwner: false, permissions };
  return PINNABLE_SCREENS.filter((screen) => isTabAllowed(holder, screen.tab));
}

export default function TeamScreen() {
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const myOutletId = useAuthStore((s) => s.outletId);
  const isDemo = useAuthStore((s) => s.isDemo);
  const myUserId = useAuthStore((s) => s.userId);

  const allowed = canOpenTeam({
    role,
    isOwner,
    permissions,
    outletId: myOutletId,
    isDemo,
  });

  const { outlets } = useOutlets();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<NewStaffForm>(EMPTY_FORM);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});

  const outletName = useCallback(
    (outletId: string | null) =>
      outletId
        ? outlets.find((o) => o.id === outletId)?.name ?? "Unknown branch"
        : "Whole store",
    [outlets]
  );

  const reload = useCallback(async () => {
    try {
      setLoadError(null);
      setStaff(await listStaff(invokeManageStaff));
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not load your team"
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!allowed) {
      setIsLoading(false);
      return;
    }
    void reload();
  }, [allowed, reload]);

  /** Runs a mutation, reports failure to the merchant, and refreshes the roster. */
  const run = useCallback(
    async (work: () => Promise<void>) => {
      setBusy(true);
      try {
        await work();
        await reload();
      } catch (error) {
        Alert.alert(
          "Could not save",
          error instanceof Error ? error.message : "The staff request failed"
        );
      } finally {
        setBusy(false);
      }
    },
    [reload]
  );

  const handleCreate = () => {
    if (form.permissions.length === 0) {
      Alert.alert("Pick permissions", "Select at least one permission for this account.");
      return;
    }
    void run(async () => {
      await createStaff(invokeManageStaff, {
        email: form.email,
        password: form.password,
        displayName: form.displayName,
        permissions: form.permissions,
        // A branch admin may only fill its own branch; the server enforces
        // this too, so the lock here is honesty, not the boundary.
        outletId: isOwner ? form.outletId : myOutletId,
        defaultTab: form.defaultTab,
      });
      setForm(EMPTY_FORM);
      setShowAddForm(false);
    });
  };

  const handleRemove = (member: StaffMember) => {
    Alert.alert(
      "Remove staff account?",
      `${member.displayName ?? member.email ?? "This account"} will lose access immediately. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => void run(() => removeStaff(invokeManageStaff, member.userId)),
        },
      ]
    );
  };

  const handleResetPassword = (member: StaffMember) => {
    const draft = passwordDrafts[member.userId] ?? "";
    if (draft.length < MIN_PASSWORD_LENGTH) {
      Alert.alert(
        "Password too short",
        `Use at least ${MIN_PASSWORD_LENGTH} characters.`
      );
      return;
    }
    void run(async () => {
      await resetStaffPassword(invokeManageStaff, member.userId, draft);
      setPasswordDrafts((drafts) => ({ ...drafts, [member.userId]: "" }));
      Alert.alert("Password updated", "Share the new password with your staff member.");
    });
  };

  const formScreens = useMemo(
    () => pinnableFor(form.permissions.length ? form.permissions : null),
    [form.permissions]
  );

  if (!allowed) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Team" />
        <View style={styles.center}>
          <Text style={styles.sub}>
            Only the store owner or a branch admin can manage staff.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <BackHeader
        title="Team"
        subtitle={
          isOwner
            ? "Add staff accounts and choose what each one can do"
            : `Staff for ${outletName(myOutletId)}`
        }
      />
      <ScrollView contentContainerStyle={styles.content}>

      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setShowAddForm((open) => !open)}
        activeOpacity={0.8}
        disabled={busy}
      >
        <Text style={styles.addButtonText}>
          {showAddForm ? "Cancel" : "+ Add Staff Account"}
        </Text>
      </TouchableOpacity>

      {showAddForm && (
        <Card title="New staff account" style={styles.section}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            keyboardType="email-address"
            value={form.email}
            onChangeText={(email) => setForm((f) => ({ ...f, email }))}
          />
          <TextInput
            style={styles.input}
            placeholder={`Password (min ${MIN_PASSWORD_LENGTH} characters)`}
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            value={form.password}
            onChangeText={(password) => setForm((f) => ({ ...f, password }))}
          />
          <TextInput
            style={styles.input}
            placeholder="Display name"
            placeholderTextColor={colors.textSecondary}
            value={form.displayName}
            onChangeText={(displayName) => setForm((f) => ({ ...f, displayName }))}
          />

          <Text style={styles.groupLabel}>Permissions</Text>
          {PERMISSION_OPTIONS.map((option) => (
            <View key={option.key} style={styles.toggleRow}>
              <View style={styles.toggleCopy}>
                <Text style={styles.toggleLabel}>{option.label}</Text>
                <Text style={styles.toggleDescription}>{option.description}</Text>
              </View>
              <Switch
                value={form.permissions.includes(option.key)}
                onValueChange={() =>
                  setForm((f) => ({
                    ...f,
                    permissions: togglePermission(f.permissions, option.key),
                  }))
                }
              />
            </View>
          ))}

          {isOwner && outlets.length > 0 && (
            <>
              <Text style={styles.groupLabel}>Branch</Text>
              <View style={styles.chipRow}>
                <Chip
                  label="Whole store"
                  selected={form.outletId === null}
                  onPress={() => setForm((f) => ({ ...f, outletId: null }))}
                />
                {outlets.map((outlet) => (
                  <Chip
                    key={outlet.id}
                    label={outlet.name}
                    selected={form.outletId === outlet.id}
                    onPress={() => setForm((f) => ({ ...f, outletId: outlet.id }))}
                  />
                ))}
              </View>
            </>
          )}

          <Text style={styles.groupLabel}>Opens on</Text>
          <View style={styles.chipRow}>
            <Chip
              label="Let the app decide"
              selected={form.defaultTab === null}
              onPress={() => setForm((f) => ({ ...f, defaultTab: null }))}
            />
            {formScreens.map((screen) => (
              <Chip
                key={screen.tab}
                label={screen.label}
                selected={form.defaultTab === screen.tab}
                onPress={() => setForm((f) => ({ ...f, defaultTab: screen.tab }))}
              />
            ))}
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleCreate}
            disabled={busy}
            activeOpacity={0.8}
          >
            {busy ? (
              <ActivityIndicator color={colors.textOnDark} />
            ) : (
              <Text style={styles.primaryButtonText}>Create Account</Text>
            )}
          </TouchableOpacity>
        </Card>
      )}

      {isLoading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : loadError ? (
        <Card style={styles.section}>
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity onPress={() => void reload()}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </Card>
      ) : (
        staff.map((member) => {
          const isExpanded = expandedId === member.userId;
          const isSelf = member.userId === myUserId;
          const manageable = !member.isOwner;
          return (
            <Card key={member.userId} style={styles.section}>
              <TouchableOpacity
                onPress={() =>
                  manageable && setExpandedId(isExpanded ? null : member.userId)
                }
                activeOpacity={manageable ? 0.7 : 1}
              >
                <View style={styles.memberHeader}>
                  <View style={styles.memberCopy}>
                    <Text style={styles.memberName}>
                      {member.displayName ?? member.email ?? "Staff"}
                      {member.isOwner ? " 👑" : isSelf ? " (you)" : ""}
                    </Text>
                    <Text style={styles.memberMeta}>{member.email ?? "—"}</Text>
                    <Text style={styles.memberMeta}>
                      {outletName(member.outletId)} ·{" "}
                      {member.isOwner ? "Owner" : describePermissions(member.permissions)}
                    </Text>
                  </View>
                  {manageable && (
                    <Text style={styles.memberChevron}>{isExpanded ? "▾" : "▸"}</Text>
                  )}
                </View>
              </TouchableOpacity>

              {isExpanded && manageable && (
                <View style={styles.manageBlock}>
                  <Text style={styles.groupLabel}>Permissions</Text>
                  {PERMISSION_OPTIONS.map((option) => {
                    const held = member.permissions?.includes(option.key) ?? true;
                    return (
                      <View key={option.key} style={styles.toggleRow}>
                        <View style={styles.toggleCopy}>
                          <Text style={styles.toggleLabel}>{option.label}</Text>
                        </View>
                        <Switch
                          value={held}
                          disabled={busy}
                          onValueChange={() => {
                            const current = member.permissions ?? [];
                            const next = togglePermission(current, option.key);
                            if (next.length === 0) {
                              Alert.alert(
                                "Keep one permission",
                                "An account needs at least one permission. Remove the account instead."
                              );
                              return;
                            }
                            void run(() =>
                              updateStaffPermissions(invokeManageStaff, member.userId, next)
                            );
                          }}
                        />
                      </View>
                    );
                  })}

                  {isOwner && outlets.length > 0 && (
                    <>
                      <Text style={styles.groupLabel}>Branch</Text>
                      <View style={styles.chipRow}>
                        <Chip
                          label="Whole store"
                          selected={member.outletId === null}
                          onPress={() =>
                            void run(() =>
                              updateStaffBranch(invokeManageStaff, member.userId, null)
                            )
                          }
                        />
                        {outlets.map((outlet) => (
                          <Chip
                            key={outlet.id}
                            label={outlet.name}
                            selected={member.outletId === outlet.id}
                            onPress={() =>
                              void run(() =>
                                updateStaffBranch(invokeManageStaff, member.userId, outlet.id)
                              )
                            }
                          />
                        ))}
                      </View>
                    </>
                  )}

                  <Text style={styles.groupLabel}>Opens on</Text>
                  <View style={styles.chipRow}>
                    <Chip
                      label="Let the app decide"
                      selected={member.defaultTab === null}
                      onPress={() =>
                        void run(() =>
                          updateStaffDefaultScreen(invokeManageStaff, member.userId, null)
                        )
                      }
                    />
                    {pinnableFor(member.permissions).map((screen) => (
                      <Chip
                        key={screen.tab}
                        label={screen.label}
                        selected={member.defaultTab === screen.tab}
                        onPress={() =>
                          void run(() =>
                            updateStaffDefaultScreen(
                              invokeManageStaff,
                              member.userId,
                              screen.tab
                            )
                          )
                        }
                      />
                    ))}
                  </View>

                  <Text style={styles.groupLabel}>Reset password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={`New password (min ${MIN_PASSWORD_LENGTH} characters)`}
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="none"
                    value={passwordDrafts[member.userId] ?? ""}
                    onChangeText={(draft) =>
                      setPasswordDrafts((drafts) => ({
                        ...drafts,
                        [member.userId]: draft,
                      }))
                    }
                  />
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => handleResetPassword(member)}
                    disabled={busy}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.secondaryButtonText}>Set New Password</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemove(member)}
                    disabled={busy}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.removeButtonText}>Remove Account</Text>
                  </TouchableOpacity>
                </View>
              )}
            </Card>
          );
        })
      )}
      </ScrollView>
    </View>
  );
}

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function Chip({ label, selected, onPress }: ChipProps) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl },
  content: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing.xxl },
  sub: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.lg, textAlign: "center" },
  addButton: {
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.separator,
    marginBottom: spacing.lg,
    ...shadow.sm,
  },
  addButtonText: { ...typography.heading, color: colors.textPrimary },
  section: { marginBottom: spacing.lg },
  loader: { marginTop: spacing.xl },
  errorText: { ...typography.body, color: colors.danger, marginBottom: spacing.sm },
  retryText: { ...typography.body, color: colors.primary, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginBottom: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
  },
  groupLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  toggleCopy: { flex: 1, paddingRight: spacing.md },
  toggleLabel: { ...typography.body, color: colors.textPrimary },
  toggleDescription: { ...typography.caption, color: colors.textSecondary },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, color: colors.textPrimary },
  chipTextSelected: { color: colors.textOnDark, fontWeight: "700" },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  primaryButtonText: { ...typography.heading, color: colors.textOnDark },
  secondaryButton: {
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.separator,
  },
  secondaryButtonText: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  memberHeader: { flexDirection: "row", alignItems: "center" },
  memberCopy: { flex: 1 },
  memberName: { ...typography.heading, color: colors.textPrimary },
  memberMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  memberChevron: { ...typography.heading, color: colors.textSecondary },
  manageBlock: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    paddingTop: spacing.sm,
  },
  removeButton: {
    backgroundColor: colors.danger,
    borderRadius: radius.full,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  removeButtonText: { ...typography.body, color: colors.textOnDark, fontWeight: "800" },
});
