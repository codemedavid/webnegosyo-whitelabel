/**
 * Settings: Tax & discounts, on the phone.
 *
 * The same five cards as the web page (BIR registration, receipts, discounts
 * offered, manager approval, service charge) over one save. Only the OWNER may
 * change them — RLS refuses everyone else, silently, so `saveTaxProfile`
 * checks a row came back — and other accounts see the same cards read-only
 * with a note saying why. The register reads this profile through the shared
 * cache (`useTaxProfile`), so a save invalidates it for every screen.
 *
 * An unreadable profile is NEVER shown as "not set up": a blank form over a
 * real profile would invite the owner to overwrite it.
 */
import React, { useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { useAuthStore } from "../../stores/auth-store";
import { useTaxProfile } from "../../lib/query/use-tax-profile";
import { useTaxSettingsCache } from "../../lib/query/use-tax-settings-cache";
import { saveTaxProfile } from "../../lib/tax-profile-service";
import {
  formFromProfile,
  isFormDirty,
  profileFromForm,
  validateTaxSettingsForm,
  type TaxSettingsErrors,
  type TaxSettingsForm,
} from "../../lib/tax-settings/form";
import { canEditTaxSettings, canOpenTaxSettings, canReviewGovDiscounts } from "../../lib/tax-settings/access";
import { canHoldApprovalPin } from "../../lib/tax-settings/approval-pin";
import { GOV_REPORT_ROUTE } from "../../lib/gov-reports/routes";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { BackHeader } from "../../components/BackHeader";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Icon } from "../../components/Icon";
import { ListRow } from "../../components/ListRow";
import { LoadingState } from "../../components/LoadingState";
import { RegistrationSection } from "../../components/tax-settings/RegistrationSection";
import { ReceiptsSection } from "../../components/tax-settings/ReceiptsSection";
import { DiscountsSection } from "../../components/tax-settings/DiscountsSection";
import { ApprovalRuleSection, ServiceChargeSection } from "../../components/tax-settings/ApprovalRuleSection";
import { ApprovalPinCard } from "../../components/tax-settings/ApprovalPinCard";

function StatusBanner({ tone, title, message }: { tone: "warning" | "info"; title: string; message: string }) {
  const isWarning = tone === "warning";
  return (
    <View style={[styles.banner, isWarning ? styles.bannerWarning : styles.bannerInfo]} accessibilityRole="summary">
      <Icon name={isWarning ? "warning" : "info"} size={18} color={isWarning ? colors.statusPending.text : colors.textSecondary} />
      <View style={styles.bannerCopy}>
        <Text style={[styles.bannerTitle, isWarning && styles.bannerTitleWarning]}>{title}</Text>
        <Text style={[styles.bannerText, isWarning && styles.bannerTextWarning]}>{message}</Text>
      </View>
    </View>
  );
}

export default function TaxSettingsScreen() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const isDemo = useAuthStore((s) => s.isDemo);
  const impersonatedTenantId = useAuthStore((s) => s.impersonatedTenantId);
  const { invalidateProfile } = useTaxSettingsCache();

  const holder = { role, isOwner, permissions, isDemo };
  const canEdit = canEditTaxSettings(holder);
  const canSeeReport = canReviewGovDiscounts(holder);
  const showPinCard = canHoldApprovalPin({ ...holder, isImpersonating: impersonatedTenantId !== null });

  const profileQuery = useTaxProfile(canOpenTaxSettings(holder) ? tenantId : null);
  const hasProfile = profileQuery.data != null;
  const loaded = formFromProfile(profileQuery.data ?? null);

  const [draft, setDraft] = useState<TaxSettingsForm | null>(null);
  const [errors, setErrors] = useState<TaxSettingsErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const form = draft ?? loaded;
  const isDirty = isFormDirty(form, loaded);

  const update = (patch: Partial<TaxSettingsForm>) => {
    setDraft((previous) => ({ ...(previous ?? loaded), ...patch }));
    setErrors((previous) => {
      const cleared = Object.keys(patch).reduce<TaxSettingsErrors>(
        (rest, key) => ({ ...rest, [key]: undefined }),
        previous,
      );
      return cleared;
    });
  };

  const handleSave = async () => {
    if (!tenantId || !canEdit) return;
    const problems = validateTaxSettingsForm(form);
    const hasProblems = Object.values(problems).some(Boolean);
    setErrors(problems);
    const profile = profileFromForm(form);
    if (hasProblems || !profile) {
      Alert.alert("Check the form", "Please fix the highlighted fields, then save again.");
      return;
    }
    setIsSaving(true);
    try {
      await saveTaxProfile(tenantId, profile);
      await invalidateProfile(tenantId);
      setDraft(null);
      Alert.alert("Saved", "Tax & discount settings saved. The register uses them from the next sale.");
    } catch (error) {
      Alert.alert("Could not save", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const header = <BackHeader title="Tax & discounts" subtitle="Senior/PWD discounts and receipts" />;

  if (!canOpenTaxSettings(holder)) {
    return (
      <View style={styles.screen}>
        {header}
        <EmptyState
          icon="settings"
          title="Owner setting"
          message={isDemo ? "Tax settings are not available in the demo store." : "Ask the store owner to open Tax & discounts."}
        />
      </View>
    );
  }
  if (profileQuery.isLoading) {
    return (
      <View style={styles.screen}>
        {header}
        <LoadingState message="Loading your tax settings" />
      </View>
    );
  }
  if (profileQuery.error && profileQuery.data === undefined) {
    return (
      <View style={styles.screen}>
        {header}
        <ErrorState
          title="We couldn't load your tax settings"
          message="Nothing was changed. Check your connection and try again."
          onRetry={() => void profileQuery.refetch()}
        />
      </View>
    );
  }

  const isLocked = !canEdit || isSaving;
  const saveLabel = hasProfile ? "Save changes" : "Save and turn on";

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl refreshing={profileQuery.isRefetching} onRefresh={() => void profileQuery.refetch()} />
        }
      >
        {!hasProfile ? (
          <StatusBanner
            tone="warning"
            title="Not set up yet"
            message={
              canEdit
                ? "Senior and PWD discounts depend on whether you're VAT-registered. Pick one below, check the rest, then save — it takes a minute."
                : "Senior and PWD discounts depend on these settings. Ask the store owner to set them up."
            }
          />
        ) : null}
        {!canEdit ? (
          <StatusBanner tone="info" title="View only" message="Only the store owner can change these settings." />
        ) : null}

        <RegistrationSection form={form} errors={errors} onChange={update} disabled={isLocked} />
        <ReceiptsSection form={form} errors={errors} onChange={update} disabled={isLocked} />
        <DiscountsSection form={form} errors={errors} onChange={update} disabled={isLocked} />
        <ApprovalRuleSection form={form} errors={errors} onChange={update} disabled={isLocked} />
        <ServiceChargeSection form={form} errors={errors} onChange={update} disabled={isLocked} />

        {canEdit ? (
          <View style={styles.saveBlock}>
            <Button
              label={saveLabel}
              size="lg"
              onPress={handleSave}
              isLoading={isSaving}
              disabled={hasProfile && !isDirty}
            />
            {draft && isDirty ? (
              <Button
                label="Discard changes"
                tone="ghost"
                onPress={() => {
                  setDraft(null);
                  setErrors({});
                }}
                fullWidth
              />
            ) : null}
          </View>
        ) : null}

        {showPinCard && tenantId ? <ApprovalPinCard tenantId={tenantId} /> : null}

        {canSeeReport ? (
          <View style={styles.group}>
            <ListRow
              icon="report"
              title="Senior & PWD sales book"
              subtitle="Every discount given, and the ones that need a look"
              onPress={() => router.push(GOV_REPORT_ROUTE)}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xxl * 2 },
  banner: {
    flexDirection: "row",
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  bannerWarning: { backgroundColor: colors.statusPending.bg },
  bannerInfo: { backgroundColor: colors.card, ...shadow.sm },
  bannerCopy: { flex: 1, gap: 2 },
  bannerTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  bannerTitleWarning: { color: colors.statusPending.text },
  bannerText: { ...typography.caption, color: colors.textSecondary },
  bannerTextWarning: { color: colors.statusPending.text },
  saveBlock: { gap: spacing.sm, marginBottom: spacing.xl },
  group: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: spacing.lg,
    ...shadow.sm,
  },
});
