import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
} from "react-native";

import { useAuthStore } from "../../stores/auth-store";
import {
  createLoyaltyProgram,
  fetchLoyaltyPrograms,
  setLoyaltyProgramStatus,
} from "../../lib/loyalty/repo";
import {
  describeProgramRules,
  EMPTY_FORM,
  nextStatusAction,
  parseProgramForm,
  STATUS_LABELS,
  type LoyaltyFlags,
  type LoyaltyProgramSummary,
  type ProgramForm,
} from "../../lib/loyalty/programs";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { ScreenHeader } from "../../components/ScreenHeader";

/**
 * Rewards: the merchant's loyalty programs.
 *
 * Every rule lives on the platform (`/api/loyalty/programs`); this screen
 * collects a form, shows what came back, and offers each program the one
 * state change its status allows. Earning itself is never triggered from
 * here — it follows orders, through the same lifecycle sync every order
 * screen already posts.
 *
 * Shadow is stated plainly on screen. A store in shadow records what its
 * customers WOULD earn and issues nothing, and a merchant reading "Live" on a
 * program while their regulars see no rewards would rightly think it broken.
 */

export default function LoyaltyScreen() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const loyaltyEnabled = useAuthStore((s) => s.loyaltyEnabled);

  const [programs, setPrograms] = useState<LoyaltyProgramSummary[]>([]);
  const [flags, setFlags] = useState<LoyaltyFlags>({ isEnabled: false, isShadow: true });
  const [status, setStatus] = useState<"loading" | "ready" | "forbidden" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [form, setForm] = useState<ProgramForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [busyProgramId, setBusyProgramId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    const result = await fetchLoyaltyPrograms(tenantId);
    if (result.ok) {
      setPrograms(result.programs);
      setFlags(result.flags);
      setStatus("ready");
      return;
    }
    setStatus(result.reason === "forbidden" ? "forbidden" : "error");
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const submit = useCallback(async () => {
    if (!tenantId) return;
    const parsed = parseProgramForm(form);
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }
    setIsSaving(true);
    setFormError(null);
    const result = await createLoyaltyProgram(tenantId, parsed.program);
    setIsSaving(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setForm(EMPTY_FORM);
    setIsComposing(false);
    await load();
  }, [tenantId, form, load]);

  const changeStatus = useCallback(
    async (program: LoyaltyProgramSummary, to: "active" | "paused" | "ended") => {
      if (!tenantId) return;
      setBusyProgramId(program.id);
      setActionError(null);
      const result = await setLoyaltyProgramStatus(tenantId, program.id, to);
      setBusyProgramId(null);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      await load();
    },
    [tenantId, load],
  );

  if (status === "forbidden") {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Rewards" />
        <EmptyState title="No access" message="Your account cannot manage loyalty programs." />
      </View>
    );
  }

  if (status === "loading") {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Rewards" />
        <LoadingState />
      </View>
    );
  }

  if (status === "error") {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Rewards" />
        <ErrorState
          message="Loyalty programs could not be loaded."
          onRetry={() => {
            setStatus("loading");
            void load();
          }}
        />
      </View>
    );
  }

  const earningNote = !loyaltyEnabled || !flags.isEnabled
    ? "Earning is switched off for this store. Programs can be set up now and start earning once loyalty is enabled."
    : flags.isShadow
      ? "Shadow mode: earning is being recorded and checked, but customers are not yet issued rewards."
      : null;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Rewards" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {earningNote ? <Text style={styles.notice}>{earningNote}</Text> : null}
        {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

        {programs.length === 0 && !isComposing ? (
          <EmptyState
            title="No programs yet"
            message="Reward regulars with a stamp card or points. Every order they complete counts once, wherever it was placed."
          />
        ) : null}

        {programs.map((program) => {
          const action = nextStatusAction(program.status);
          const isBusy = busyProgramId === program.id;
          return (
            <View key={program.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{program.name}</Text>
                <Text style={[styles.badge, program.status === "active" && styles.badgeLive]}>
                  {STATUS_LABELS[program.status]}
                </Text>
              </View>
              <Text style={styles.cardRules}>{describeProgramRules(program.rules)}</Text>
              <Text style={styles.cardMeta}>
                {program.members} member{program.members === 1 ? "" : "s"} · {program.rewardsOutstanding} reward
                {program.rewardsOutstanding === 1 ? "" : "s"} unclaimed
                {program.versionNumber ? ` · rules v${program.versionNumber}` : ""}
              </Text>
              {action ? (
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.button}
                    disabled={isBusy}
                    onPress={() => void changeStatus(program, action.to)}
                  >
                    <Text style={styles.buttonLabel}>{isBusy ? "Saving…" : action.label}</Text>
                  </TouchableOpacity>
                  {program.status !== "draft" ? (
                    <TouchableOpacity
                      style={styles.buttonGhost}
                      disabled={isBusy}
                      onPress={() => void changeStatus(program, "ended")}
                    >
                      <Text style={styles.buttonGhostLabel}>End</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}

        {isComposing ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>New program</Text>
            <TextInput
              style={styles.input}
              placeholder="Name, e.g. Coffee card"
              placeholderTextColor={colors.textSecondary}
              value={form.name}
              onChangeText={(name) => setForm({ ...form, name })}
            />
            <View style={styles.segment}>
              {(["stamp", "points"] as const).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.segmentItem, form.earnMode === mode && styles.segmentActive]}
                  onPress={() => setForm({ ...form, earnMode: mode })}
                >
                  <Text style={[styles.segmentLabel, form.earnMode === mode && styles.segmentLabelActive]}>
                    {mode === "stamp" ? "Stamps per order" : "Points per peso"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Field
              label={form.earnMode === "stamp" ? "Orders per reward" : "Points per reward"}
              value={form.threshold}
              onChange={(threshold) => setForm({ ...form, threshold })}
            />
            {form.earnMode === "points" ? (
              <Field
                label="Points per ₱1"
                value={form.pointsPerPeso}
                onChange={(pointsPerPeso) => setForm({ ...form, pointsPerPeso })}
              />
            ) : null}
            <Field
              label="Minimum order (optional)"
              value={form.minSpend}
              onChange={(minSpend) => setForm({ ...form, minSpend })}
            />
            <View style={styles.segment}>
              {(["fixed", "percent"] as const).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.segmentItem, form.rewardType === type && styles.segmentActive]}
                  onPress={() => setForm({ ...form, rewardType: type })}
                >
                  <Text style={[styles.segmentLabel, form.rewardType === type && styles.segmentLabelActive]}>
                    {type === "fixed" ? "₱ off" : "% off"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Field
              label={form.rewardType === "fixed" ? "Reward amount (₱)" : "Reward percent"}
              value={form.rewardValue}
              onChange={(rewardValue) => setForm({ ...form, rewardValue })}
            />
            {form.rewardType === "percent" ? (
              <Field
                label="Cap (₱, optional)"
                value={form.rewardCap}
                onChange={(rewardCap) => setForm({ ...form, rewardCap })}
              />
            ) : null}
            {formError ? <Text style={styles.error}>{formError}</Text> : null}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.button} disabled={isSaving} onPress={() => void submit()}>
                <Text style={styles.buttonLabel}>{isSaving ? "Saving…" : "Save as draft"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.buttonGhost}
                disabled={isSaving}
                onPress={() => {
                  setIsComposing(false);
                  setFormError(null);
                }}
              >
                <Text style={styles.buttonGhostLabel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.button} onPress={() => setIsComposing(true)}>
            <Text style={styles.buttonLabel}>New program</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        value={value}
        onChangeText={onChange}
        placeholderTextColor={colors.textSecondary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md },
  notice: { ...typography.caption, color: colors.textSecondary, fontStyle: "italic" },
  error: { ...typography.caption, color: colors.danger },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
    ...shadow.sm,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { ...typography.heading, color: colors.textPrimary },
  cardRules: { ...typography.body, color: colors.textPrimary },
  cardMeta: { ...typography.caption, color: colors.textSecondary },
  badge: {
    ...typography.caption,
    color: colors.textSecondary,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  badgeLive: { color: colors.textOnDark, backgroundColor: colors.success },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  button: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  buttonLabel: { ...typography.body, color: colors.textOnDark, fontWeight: "600" },
  buttonGhost: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    alignItems: "center",
  },
  buttonGhostLabel: { ...typography.body, color: colors.textSecondary, fontWeight: "600" },
  segment: { flexDirection: "row", gap: spacing.xs },
  segmentItem: {
    flex: 1,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    alignItems: "center",
  },
  segmentActive: { backgroundColor: colors.primary },
  segmentLabel: { ...typography.caption, color: colors.textSecondary },
  segmentLabelActive: { color: colors.textOnDark, fontWeight: "600" },
  field: { gap: 2 },
  fieldLabel: { ...typography.caption, color: colors.textSecondary },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
});
