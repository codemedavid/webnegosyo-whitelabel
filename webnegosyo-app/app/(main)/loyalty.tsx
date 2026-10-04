import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
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
  EMPTY_FORM,
  parseProgramForm,
  programToForm,
  type LoyaltyFlags,
  type LoyaltyProgramSummary,
  type ProgramForm,
} from "../../lib/loyalty/programs";
import { previewSteps } from "../../lib/loyalty/wizard";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useOutlets } from "../../lib/use-outlets";
import { listProducts, type Product } from "../../lib/products";
import { getWebAppUrl } from "../../lib/web-app-url";
import { LoyaltySmsDeviceCard } from "../../components/LoyaltySmsDeviceCard";
import { WalletVerificationCard } from "../../components/loyalty/WalletVerificationCard";
import { SegmentedControl } from "../../components/SegmentedControl";
import { LoyaltyActivityPanel } from "../../components/loyalty/LoyaltyActivityPanel";
import { LoyaltyMembersPanel } from "../../components/loyalty/LoyaltyMembersPanel";
import { ProgramCard } from "../../components/loyalty/ProgramCard";
import { ProgramWizard } from "../../components/loyalty/ProgramWizard";
import { Celebration } from "../../components/loyalty/Celebration";

/**
 * Rewards: who is collecting, and the programmes they are collecting on.
 *
 * Two halves, because a merchant opens this screen for two different reasons.
 * MEMBERS is the daily one — who can claim now, who is one visit away, who has
 * gone quiet — so it opens first. PROGRAMMES is the setup, visited once and
 * then rarely.
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
  const [section, setSection] = useState<"members" | "programs" | "activity">("members");
  // Bumped whenever a programme changes: the member counts hang off the rules.
  const [membersEpoch, setMembersEpoch] = useState(0);

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
  const [celebration, setCelebration] = useState<{ title: string; message: string; emojis: string[] } | null>(null);

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
      setMembersEpoch(epoch => epoch + 1);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const submit = useCallback(async (launch: boolean) => {
    if (!tenantId) return;
    const parsed = parseProgramForm(form);
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }
    setIsSaving(true);
    setFormError(null);
    const emojis = previewSteps(form).map(step => step.emoji);
    const isRevision = Boolean(editing);
    let isLive = false;
    if (editing) {
      const result = await reviseLoyaltyProgram(tenantId, editing.id, parsed.program.rules, editing.versionNumber);
      if (!result.ok) {
        setIsSaving(false);
        setFormError(result.error);
        return;
      }
    } else {
      const created = await createLoyaltyProgram(tenantId, parsed.program);
      if (!created.ok) {
        setIsSaving(false);
        setFormError(created.error);
        return;
      }
      // Launching is a second request: if it fails the card is still saved as a
      // draft, and the list says so with its own Activate button.
      if (launch && created.programId) {
        const launched = await setLoyaltyProgramStatus(tenantId, created.programId, "active");
        isLive = launched.ok;
        if (!launched.ok) setActionError(`Saved as a draft, but it could not go live: ${launched.error}`);
      }
    }
    setIsSaving(false);
    setForm(EMPTY_FORM);
    setEditing(null);
    setIsComposing(false);
    setSection("programs");
    setMembersEpoch((epoch) => epoch + 1);
    setCelebration(
      isRevision
        ? { title: "Card updated!", message: "New visits earn on the new rewards.", emojis }
        : isLive
          ? { title: "Your card is live!", message: "Every completed order now earns a stamp.", emojis }
          : { title: "Card saved!", message: "It’s a draft — launch it when you're ready.", emojis },
    );
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
      setMembersEpoch((epoch) => epoch + 1);
      await load();
    },
    [tenantId, load],
  );

  // Stable, so the overlay's auto-close timer is not reset on every render.
  const dismissCelebration = useCallback(() => setCelebration(null), []);

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

        <SegmentedControl
          options={[
            { label: "Members", value: "members" as const },
            { label: "Activity", value: "activity" as const },
            { label: "Programmes", value: "programs" as const },
          ]}
          value={section}
          onChange={setSection}
          accessibilityPrefix="Show"
        />

        {section === "members" ? (
          <LoyaltyMembersPanel key={tenantId} tenantId={tenantId} reloadKey={membersEpoch} />
        ) : section === "activity" ? (
          <LoyaltyActivityPanel key={tenantId} tenantId={tenantId} reloadKey={membersEpoch} />
        ) : (
          <>
        {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
        {outletsError ? <Text style={styles.error}>Branches could not be loaded, so new cards can only earn at all branches. {outletsError}</Text> : null}
        {programs.length === 0 ? (
          <View style={styles.hero}>
            <Text style={styles.heroEmoji}>🎟️🥤🎁</Text>
            <Text style={styles.heroTitle}>Turn regulars into fans</Text>
            <Text style={styles.heroText}>Build a stamp card with rewards along the way — a free drink at 5, a free meal at 10. Customers see it on every receipt.</Text>
          </View>
        ) : null}

        {programs.map((program) => (
          <ProgramCard
            key={program.id}
            program={program}
            branchName={program.scope === "branch" ? outlets.find(outlet => outlet.id === program.outletId)?.name ?? "Selected branch" : "All branches"}
            isBusy={busyProgramId === program.id}
            onEdit={() => { setEditing(program); setForm(programToForm(program)); setFormError(null); setIsComposing(true); }}
            onStatus={(to) => void changeStatus(program, to)}
          />
        ))}

        <TouchableOpacity
          style={styles.create}
          accessibilityRole="button"
          onPress={() => { setEditing(null); setForm(EMPTY_FORM); setFormError(null); setIsComposing(true); }}
        >
          <Text style={styles.createLabel}>＋ Create a reward card</Text>
        </TouchableOpacity>

        <WalletVerificationCard />
        <LoyaltySmsDeviceCard />
        {tenantSlug ? <TouchableOpacity accessibilityRole="link" onPress={() => void Linking.openURL(`${getWebAppUrl()}/${tenantSlug}/loyalty`)}><Text style={styles.link}>See your customers’ rewards page ↗</Text></TouchableOpacity> : null}
        {tenantSlug ? <TouchableOpacity accessibilityRole="link" onPress={() => void Linking.openURL(`${getWebAppUrl()}/${tenantSlug}/admin/loyalty`)}><Text style={styles.link}>Manage reward sale syncing on the web ↗</Text></TouchableOpacity> : null}
          </>
        )}
      </ScrollView>

      <ProgramWizard
        isVisible={isComposing}
        isEditing={Boolean(editing)}
        form={form}
        onFormChange={setForm}
        outlets={outlets}
        products={products}
        catalogError={catalogError}
        isSaving={isSaving}
        saveError={formError}
        onSubmit={(launch) => void submit(launch)}
        onClose={() => { if (!isSaving) { setIsComposing(false); setFormError(null); } }}
      />
      <Celebration
        isVisible={celebration !== null}
        title={celebration?.title ?? ""}
        message={celebration?.message ?? ""}
        emojis={celebration?.emojis ?? []}
        onDone={dismissCelebration}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  notice: { ...typography.caption, color: colors.textSecondary, fontStyle: "italic" },
  error: { ...typography.caption, color: colors.danger },
  hero: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.xs,
    ...shadow.sm,
  },
  heroEmoji: { fontSize: 40, letterSpacing: 4 },
  heroTitle: { ...typography.title, color: colors.textPrimary, textAlign: "center" },
  heroText: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  create: {
    paddingVertical: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.success,
    borderBottomWidth: 4,
    borderBottomColor: "#03543F",
    alignItems: "center",
  },
  createLabel: { ...typography.heading, color: colors.textOnDark, fontWeight: "800" },
  link: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
});
