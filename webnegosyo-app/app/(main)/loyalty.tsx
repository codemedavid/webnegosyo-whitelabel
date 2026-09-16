import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Alert,
  Linking,
} from "react-native";

import { useAuthStore } from "../../stores/auth-store";
import {
  createLoyaltyProgram,
  fetchLoyaltyPrograms,
  reviseLoyaltyProgram,
  setLoyaltyProgramStatus,
} from "../../lib/loyalty/repo";
import {
  describeProgramRules,
  EMPTY_FORM,
  nextStatusAction,
  parseProgramForm,
  programToForm,
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
import { useOutlets } from "../../lib/use-outlets";
import { listProducts, type Product } from "../../lib/products";
import { getWebAppUrl } from "../../lib/web-app-url";
import { LoyaltySmsDeviceCard } from "../../components/LoyaltySmsDeviceCard";

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
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const { outlets, error: outletsError } = useOutlets();
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LoyaltyProgramSummary | null>(null);

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

  useEffect(() => {
    if (!tenantId || !isComposing) return;
    let active = true;
    setProducts([]);
    setCatalogError(null);
    listProducts(tenantId, form.scope === "branch" ? form.outletId : null).then(
      rows => { if (active) setProducts(rows.filter(row => row.is_available && !row.presell_enabled)); },
      () => { if (active) setCatalogError("Menu items could not be loaded. Reopen the form to retry."); },
    );
    return () => { active = false; };
  }, [tenantId, isComposing, form.scope, form.outletId]);

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
    const result = editing
      ? await reviseLoyaltyProgram(tenantId, editing.id, parsed.program.rules, editing.versionNumber)
      : await createLoyaltyProgram(tenantId, parsed.program);
    setIsSaving(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setForm(EMPTY_FORM);
    setEditing(null);
    setIsComposing(false);
    await load();
  }, [tenantId, form, load, editing]);

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

  // Activating a program switches the store live (both flags), so a store with
  // nothing active is simply not earning yet — not blocked on the platform.
  const earningNote = !flags.isEnabled
    ? "No program is live yet. Activate one and this store starts stamping straight away — customers can view progress on your loyalty page."
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
        <LoyaltySmsDeviceCard />
        {tenantSlug ? <TouchableOpacity accessibilityRole="link" onPress={() => void Linking.openURL(`${getWebAppUrl()}/${tenantSlug}/admin/loyalty`)}><Text style={styles.cardRules}>Manage reward sale syncing on the web ↗</Text></TouchableOpacity> : null}
        {tenantSlug ? <TouchableOpacity accessibilityRole="link" onPress={() => void Linking.openURL(`${getWebAppUrl()}/${tenantSlug}/loyalty`)}><Text style={styles.cardRules}>Open customer loyalty page ↗</Text></TouchableOpacity> : null}

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
              {program.activatesAt ? <Text style={styles.cardMeta}>Earns from {new Date(program.activatesAt).toLocaleDateString("en-PH")}{program.endsAt ? ` until ${new Date(program.endsAt).toLocaleDateString("en-PH")}` : ""}</Text> : null}
              <Text style={styles.cardMeta}>
                {program.scope === "branch" ? outlets.find(outlet => outlet.id === program.outletId)?.name ?? "Selected branch" : "All branches"}
                {program.rules?.rewardExpiryDays ? ` · Rewards expire after ${program.rules.rewardExpiryDays} days` : " · Rewards do not expire"}
              </Text>
              {program.status !== "ended" ? <TouchableOpacity style={styles.buttonGhost} disabled={isSaving} onPress={() => {
                setEditing(program); setForm(programToForm(program)); setFormError(null); setIsComposing(true);
              }}><Text style={styles.buttonGhostLabel}>Edit reward & rules</Text></TouchableOpacity> : null}
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
                      onPress={() => Alert.alert("End this program?", "New orders will stop earning. Rewards already issued keep their terms.", [{ text: "Cancel", style: "cancel" }, { text: "End program", style: "destructive", onPress: () => void changeStatus(program, "ended") }])}
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
            <Text style={styles.cardTitle}>{editing ? "Edit reward & rules" : "New program"}</Text>
            {editing ? <Text style={styles.notice}>Changes apply to future earning. Rewards already issued keep their original terms.</Text> : null}
            <TextInput
              style={styles.input}
              placeholder="Name, e.g. Coffee card"
              placeholderTextColor={colors.textSecondary}
              editable={!editing && !isSaving}
              accessibilityLabel="Program name"
              value={form.name}
              onChangeText={(name) => setForm({ ...form, name })}
            />
            <View style={styles.segment}>
              {(["stamp", "points"] as const).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.segmentItem, form.earnMode === mode && styles.segmentActive]}
                  disabled={!!editing || isSaving}
                  onPress={() => setForm({ ...form, earnMode: mode })}
                >
                  <Text style={[styles.segmentLabel, form.earnMode === mode && styles.segmentLabelActive]}>
                    {mode === "stamp" ? "Stamps per order" : "Points per peso"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {!editing ? <>
              <Text style={styles.fieldLabel}>Where customers earn</Text>
              <View style={styles.segment}>{(["business", "branch"] as const).map(scope => <TouchableOpacity key={scope} style={[styles.segmentItem, form.scope === scope && styles.segmentActive]} onPress={() => setForm({ ...form, scope })}><Text style={[styles.segmentLabel, form.scope === scope && styles.segmentLabelActive]}>{scope === "business" ? "All branches" : "One branch"}</Text></TouchableOpacity>)}</View>
              {form.scope === "branch" ? <View style={styles.field}>
                {outletsError ? <Text style={styles.error}>{outletsError}</Text> : null}
                {outlets.map(outlet => <TouchableOpacity key={outlet.id} style={styles.buttonGhost} onPress={() => setForm({ ...form, outletId: outlet.id })}><Text style={styles.buttonGhostLabel}>{form.outletId === outlet.id ? "Selected: " : ""}{outlet.name}</Text></TouchableOpacity>)}
              </View> : null}
            </> : null}
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
              {(["fixed", "percent", "free_item"] as const).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.segmentItem, form.rewardType === type && styles.segmentActive]}
                  onPress={() => setForm({ ...form, rewardType: type })}
                >
                  <Text style={[styles.segmentLabel, form.rewardType === type && styles.segmentLabelActive]}>
                    {type === "fixed" ? "₱ off" : type === "percent" ? "% off" : "Free item"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {form.rewardType === "free_item" ? <View style={styles.field}>
              <Text style={styles.fieldLabel}>Choose one free base item</Text>
              <Text style={styles.notice}>Upgrades and add-ons stay payable. Unavailable items cannot be substituted.</Text>
              {catalogError ? <Text style={styles.error}>{catalogError}</Text> : null}
              {form.rewardItemName ? <Text style={styles.cardRules}>Selected: {form.rewardItemName}</Text> : null}
              {products.map(item => <TouchableOpacity key={item.id} style={styles.buttonGhost} onPress={() => setForm({ ...form, rewardItemId: item.id, rewardItemName: item.name })}><Text style={styles.buttonGhostLabel}>{form.rewardItemId === item.id ? "Selected: " : ""}{item.name}</Text></TouchableOpacity>)}
            </View> : <Field
              label={form.rewardType === "fixed" ? "Reward amount (₱)" : "Reward percent"}
              value={form.rewardValue}
              onChange={(rewardValue) => setForm({ ...form, rewardValue })}
            />}
            {form.rewardType === "percent" ? (
              <Field
                label="Cap (₱, optional)"
                value={form.rewardCap}
                onChange={(rewardCap) => setForm({ ...form, rewardCap })}
              />
            ) : null}
            {!editing ? <>
              <Text style={styles.notice}>Optional earning dates, in Manila time. Activate the draft to start or schedule earning.</Text>
              <Field label="Activation date (YYYY-MM-DD, optional)" value={form.activatesAt} onChange={activatesAt => setForm({ ...form, activatesAt })} numeric={false} />
              <Field label="End date (YYYY-MM-DD, optional)" value={form.endsAt} onChange={endsAt => setForm({ ...form, endsAt })} numeric={false} />
            </> : null}
            <Field label="Reward expiry (days, optional)" value={form.rewardExpiryDays} onChange={(rewardExpiryDays) => setForm({ ...form, rewardExpiryDays })} />
            <Text style={styles.notice}>One reward per sale. Rewards cannot combine with vouchers or manual discounts.</Text>
            {formError ? <Text style={styles.error}>{formError}</Text> : null}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.button} disabled={isSaving} onPress={() => void submit()}>
                <Text style={styles.buttonLabel}>{isSaving ? "Saving…" : editing ? "Save new rules" : "Save as draft"}</Text>
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
          <TouchableOpacity style={styles.button} onPress={() => { setEditing(null); setForm(EMPTY_FORM); setIsComposing(true); }}>
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
  numeric = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  numeric?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        accessibilityLabel={label}
        keyboardType={numeric ? "decimal-pad" : "default"}
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
