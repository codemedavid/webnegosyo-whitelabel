import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";

import { useAuthStore } from "../../../stores/auth-store";
import { DEMO_READONLY_MESSAGE } from "../../../lib/demo";
import { NEW_VOUCHER_ID, voucherHref } from "../../../lib/navigation";
import { goTo } from "../../../lib/tab-navigation";
import { useNowMs } from "../../../lib/use-now-ms";
import { useCategories, useProducts } from "../../../lib/query/use-products";
import {
  useVoucher,
  useVoucherRedemptions,
  useVouchersInvalidation,
} from "../../../lib/query/use-vouchers";
import { saveVoucher, setVoucherActive } from "../../../lib/voucher-admin/voucher-repository";
import {
  CHANNEL_OPTIONS,
  DISCOUNT_TYPE_OPTIONS,
  END_PRESETS,
  MAX_CODE_LENGTH,
  QUICK_VALUES,
  SCOPE_OPTIONS,
  buildVoucherForm,
  endOfDayIso,
  endPresetIso,
  formFromTemplate,
  formToDraft,
  formToPreview,
  isFormDirty,
  issueFor,
  startOfDayIso,
  suggestVoucherCode,
  validateVoucherForm,
  type VoucherForm,
} from "../../../lib/voucher-admin/voucher-form";
import { formatAmount, voucherShareMessage } from "../../../lib/voucher-admin/voucher-status";
import { normalizeVoucherCode, type VoucherIssue } from "../../../lib/vouchers/admin-validation";
import { toCategoryOptions, toProductOptions } from "../../../lib/vouchers/target-picker";
import type { VoucherChannel } from "../../../lib/vouchers/types";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { BackHeader } from "../../../components/BackHeader";
import { Button } from "../../../components/Button";
import { ErrorState } from "../../../components/ErrorState";
import { IconButton } from "../../../components/IconButton";
import { Icon } from "../../../components/Icon";
import { LoadingState } from "../../../components/LoadingState";
import { OptionPills } from "../../../components/OptionPills";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { DateChoiceField } from "../../../components/vouchers/DateChoiceField";
import { VoucherPerformanceCard } from "../../../components/vouchers/VoucherPerformanceCard";
import { VoucherTargetSheet } from "../../../components/vouchers/VoucherTargetSheet";
import { VoucherTicket } from "../../../components/vouchers/VoucherTicket";
import {
  ChoiceTiles,
  FormSection,
  InfoNote,
  LabeledInput,
  QuickChips,
} from "../../../components/vouchers/VoucherFormFields";

/**
 * Create or edit one voucher.
 *
 * Laid out in the order a merchant decides a promotion — what the deal is,
 * what customers type, what it covers, the fine print, when it runs, where it
 * works — with the finished ticket drawn live at the top, so the effect of
 * every field is visible before anything is saved. A saved voucher also shows
 * how it has been used, and can be switched off; it is never deleted, because
 * past orders still point at it.
 */

const NUMERIC = Platform.select({ ios: "decimal-pad", default: "numeric" } as const);
const WHOLE = "number-pad" as const;

export default function VoucherEditorScreen() {
  const { voucherId, template } = useLocalSearchParams<{ voucherId: string; template?: string }>();
  const isNew = voucherId === NEW_VOUCHER_ID;
  const tenantId = useAuthStore((s) => s.tenantId);
  const tenantName = useAuthStore((s) => s.tenantName);
  const insets = useSafeAreaInsets();

  const saved = useVoucher(tenantId, isNew ? null : voucherId ?? null);
  const uses = useVoucherRedemptions(tenantId, isNew ? null : voucherId ?? null);
  const products = useProducts(tenantId);
  const categories = useCategories(tenantId);
  const invalidateVouchers = useVouchersInvalidation();

  // The screen stays mounted between visits (it lives in the tab navigator),
  // so the draft is thrown away on leaving and rebuilt from the latest saved
  // row — or a clean slate — on the next visit.
  const [draft, setDraft] = useState<{ key: string; initial: VoucherForm; form: VoucherForm } | null>(null);
  const [hasTriedSave, setHasTriedSave] = useState(false);
  const [serverIssues, setServerIssues] = useState<VoucherIssue[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const nowMs = useNowMs();
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const isFocused = useIsFocused();

  useFocusEffect(
    useCallback(
      () => () => {
        setDraft(null);
        setHasTriedSave(false);
        setServerIssues([]);
        setIsPickerOpen(false);
      },
      [],
    ),
  );

  const draftKey = `${voucherId}|${template ?? ""}`;
  const loadedVoucher = saved.data ?? null;
  const isReady = isNew || (!saved.isLoading && loadedVoucher !== null);
  // Built only while focused: on blur the draft is dropped, and rebuilding it
  // then would freeze a copy of the row that the next visit should re-read.
  if (isFocused && isReady && draft?.key !== draftKey) {
    const initial = isNew
      ? (template ? formFromTemplate(template, now) : null) ?? buildVoucherForm(null)
      : buildVoucherForm(loadedVoucher);
    setDraft({ key: draftKey, initial, form: initial });
  }

  const form = draft?.key === draftKey ? draft.form : null;
  const update = (patch: Partial<VoucherForm>) =>
    setDraft((prev) => (prev ? { ...prev, form: { ...prev.form, ...patch } } : prev));

  const validation = useMemo(() => (form ? validateVoucherForm(form) : null), [form]);
  const issues = [...serverIssues, ...(validation?.errors ?? [])];
  const errorFor = (field: string) => (hasTriedSave ? issueFor(issues, field) : null);
  const warningFor = (field: string) => issueFor(validation?.warnings ?? [], field);
  const isDirty = draft && form ? isFormDirty(draft.initial, form) : false;

  const targetOptions = useMemo(() => {
    if (form?.scope === "categories") return toCategoryOptions(categories.data ?? []);
    return toProductOptions(products.data ?? [], categories.data ?? []);
  }, [form?.scope, products.data, categories.data]);
  const targetNames = useMemo(() => {
    const byId = new Map(targetOptions.map((option) => [option.id, option.label]));
    return (form?.targetIds ?? []).map((id) => byId.get(id)).filter((name): name is string => !!name);
  }, [targetOptions, form?.targetIds]);

  const blockedByDemo = (): boolean => {
    if (!useAuthStore.getState().isDemo) return false;
    Alert.alert("Demo mode", DEMO_READONLY_MESSAGE);
    return true;
  };

  const leave = () => {
    if (!isDirty) {
      router.back();
      return;
    }
    Alert.alert("Discard changes?", "Your edits to this voucher haven't been saved.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  };

  // The header's back button asks before discarding; Android's hardware back
  // must ask too, or the blur below throws the edit away silently. Only while
  // this screen is the one in front and actually holds unsaved edits.
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  useEffect(() => {
    if (!isFocused || !isDirty) return undefined;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      leaveRef.current();
      return true;
    });
    return () => listener.remove();
  }, [isFocused, isDirty]);

  const share = (code: string) => {
    const preview = form ? formToPreview({ ...form, code }, loadedVoucher) : null;
    if (!preview) return;
    void Share.share({ message: voucherShareMessage(preview, tenantName, new Date()) });
  };

  const handleSave = async () => {
    if (!form || !tenantId || blockedByDemo()) return;
    setHasTriedSave(true);
    setServerIssues([]);
    if ((validation?.errors.length ?? 0) > 0) return;

    setIsSaving(true);
    const result = await saveVoucher(tenantId, formToDraft(form), isNew ? undefined : voucherId);
    setIsSaving(false);
    void invalidateVouchers(tenantId);

    if (!result.ok) {
      setServerIssues(result.issues ?? []);
      Alert.alert("Couldn't save", result.error);
      // A new voucher whose targets failed WAS created: move onto it, so the
      // retry updates it instead of tripping over its own code.
      if (isNew && result.voucherId) goTo(router, voucherHref(result.voucherId));
      return;
    }

    if (!isNew) {
      setDraft((prev) => (prev ? { ...prev, initial: prev.form } : prev));
      router.back();
      return;
    }
    const code = normalizeVoucherCode(form.code);
    goTo(router, voucherHref(result.voucherId));
    Alert.alert(`${code} is ready`, "Share it so your customers know to use it.", [
      { text: "Not now", style: "cancel" },
      { text: "Share", onPress: () => share(code) },
    ]);
  };

  const handleActive = (isActive: boolean) => {
    if (!tenantId || !loadedVoucher || isToggling || blockedByDemo()) return;
    const apply = async () => {
      setIsToggling(true);
      try {
        await setVoucherActive(loadedVoucher.id, tenantId, isActive);
        await invalidateVouchers(tenantId);
      } catch {
        Alert.alert("Couldn't update", "Check your connection and try again.");
      } finally {
        setIsToggling(false);
      }
    };
    if (isActive) {
      void apply();
      return;
    }
    Alert.alert(`Switch off ${loadedVoucher.code}?`, "Customers and your counter won't be able to use it.", [
      { text: "Keep it on", style: "cancel" },
      { text: "Switch off", style: "destructive", onPress: () => void apply() },
    ]);
  };

  const title = isNew ? "New voucher" : loadedVoucher?.code ?? "Voucher";

  if (!isNew && saved.isLoading) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Voucher" />
        <LoadingState message="Opening voucher…" />
      </View>
    );
  }
  if (!isNew && (saved.error || !loadedVoucher)) {
    return (
      <View style={styles.screen}>
        <BackHeader title="Voucher" />
        <ErrorState
          title={saved.error ? "Couldn't open this voucher" : "Voucher not found"}
          message={saved.error ? "Check your connection, then try again." : "It may belong to another store."}
          onRetry={saved.error ? () => void saved.refetch() : undefined}
        />
      </View>
    );
  }
  if (!form) return <View style={styles.screen} />;

  const isFreeDelivery = form.discountType === "free_delivery";
  const quickValues = form.discountType === "free_delivery" ? [] : QUICK_VALUES[form.discountType];
  const valueNumber = Number(form.discountValue);
  const preview = formToPreview(form, loadedVoucher);
  const errorCount = hasTriedSave ? issues.length : 0;

  return (
    <View style={styles.screen}>
      <BackHeader
        title={title}
        subtitle={isNew ? "Set up a promo code" : loadedVoucher?.name}
        onBack={leave}
        actions={
          !isNew && loadedVoucher ? (
            <IconButton icon="export" label="Share code" onPress={() => share(loadedVoucher.code)} />
          ) : undefined
        }
      />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <VoucherTicket voucher={preview} now={now} codePlaceholder="YOURCODE" />

          {loadedVoucher && !loadedVoucher.isActive ? (
            <View style={styles.offBanner}>
              <Text style={styles.offText}>Switched off — nobody can use this code.</Text>
              <TouchableOpacity
                onPress={() => handleActive(true)}
                disabled={isToggling}
                accessibilityRole="button"
                accessibilityState={{ disabled: isToggling }}
              >
                <Text style={styles.offAction}>Switch on</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {!isNew ? (
            <View style={styles.performance}>
              <Text style={styles.performanceTitle}>How it&apos;s doing</Text>
              <VoucherPerformanceCard
                redemptions={uses.data}
                isLoading={uses.isLoading}
                error={uses.error}
                onRetry={() => void uses.refetch()}
              />
            </View>
          ) : null}

          <FormSection title="The deal">
            <ChoiceTiles
              options={DISCOUNT_TYPE_OPTIONS}
              value={form.discountType}
              // The cap only exists for a percentage; a stale hidden value
              // reappearing on the way back to "% off" reads as a typo.
              onChange={(discountType) =>
                update({
                  discountType,
                  maxDiscountAmount: discountType === "percent" ? form.maxDiscountAmount : "",
                })
              }
            />
            {isFreeDelivery ? (
              <InfoNote text="Waives the delivery fee. Pickup and dine-in orders get nothing off, so pair it with a minimum order." />
            ) : (
              <>
                <LabeledInput
                  label={form.discountType === "percent" ? "Percentage off" : "Amount off"}
                  value={form.discountValue}
                  onChangeText={(discountValue) => update({ discountValue })}
                  placeholder="0"
                  prefix={form.discountType === "fixed" ? "₱" : undefined}
                  suffix={form.discountType === "percent" ? "%" : undefined}
                  keyboardType={NUMERIC}
                  error={errorFor("discountValue")}
                />
                <QuickChips
                  values={quickValues}
                  format={(v) => (form.discountType === "percent" ? `${v}%` : formatAmount(v))}
                  selected={Number.isFinite(valueNumber) ? valueNumber : null}
                  onPick={(v) => update({ discountValue: String(v) })}
                />
              </>
            )}
            {form.discountType === "percent" ? (
              <LabeledInput
                label="Maximum discount"
                hint="Optional. Caps how much one order can save."
                value={form.maxDiscountAmount}
                onChangeText={(maxDiscountAmount) => update({ maxDiscountAmount })}
                placeholder="No cap"
                prefix="₱"
                keyboardType={NUMERIC}
                error={errorFor("maxDiscountAmount")}
                warning={warningFor("maxDiscountAmount")}
              />
            ) : null}
          </FormSection>

          <FormSection title="Code" hint="What customers type at checkout or tell your cashier.">
            <LabeledInput
              isFirst
              isCode
              label="Code"
              value={form.code}
              onChangeText={(code) => update({ code: code.replace(/\s+/g, "").toUpperCase() })}
              placeholder="e.g. SAVE10"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={MAX_CODE_LENGTH}
              error={errorFor("code")}
              hint="Letters and numbers, no spaces. Not case-sensitive for customers."
              action={{ label: "Suggest", icon: "rotate", onPress: () => update({ code: suggestVoucherCode(form) }) }}
              testID="voucher-code"
            />
            <LabeledInput
              label="Name"
              value={form.name}
              onChangeText={(name) => update({ name })}
              placeholder="e.g. Launch week promo"
              autoCapitalize="sentences"
              error={errorFor("name")}
              hint="Shown on the order and receipt next to the discount."
            />
          </FormSection>

          {!isFreeDelivery ? (
            <FormSection title="Applies to">
              <SegmentedControl
                options={SCOPE_OPTIONS}
                value={form.scope}
                onChange={(scope) => update({ scope, targetIds: scope === form.scope ? form.targetIds : [] })}
                accessibilityPrefix="Applies to"
              />
              {form.scope === "universal" ? (
                <Text style={styles.scopeHint}>Takes the discount off everything in the order.</Text>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.pickRow, errorFor("targetIds") ? styles.pickRowError : null]}
                    onPress={() => setIsPickerOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose ${form.scope}`}
                  >
                    <View style={styles.flex}>
                      <Text style={styles.pickTitle}>
                        {form.targetIds.length === 0
                          ? `Choose ${form.scope}`
                          : `${form.targetIds.length} ${form.scope === "categories" ? (form.targetIds.length === 1 ? "category" : "categories") : form.targetIds.length === 1 ? "product" : "products"} selected`}
                      </Text>
                      {targetNames.length > 0 ? (
                        <Text style={styles.pickNames} numberOfLines={2}>
                          {targetNames.join(", ")}
                        </Text>
                      ) : null}
                    </View>
                    <Icon name="chevron" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                  {errorFor("targetIds") ? <Text style={styles.errorText}>{errorFor("targetIds")}</Text> : null}
                  {form.scope === "categories" && form.channels.includes("pos") ? (
                    <InfoNote text="The counter can't tell which category a sale's items are in yet, so category codes only work online." />
                  ) : null}
                </>
              )}
            </FormSection>
          ) : null}

          <FormSection title="Rules" hint="Leave any of these blank for no limit.">
            <LabeledInput
              isFirst
              label="Minimum order"
              value={form.minOrderAmount}
              onChangeText={(minOrderAmount) => update({ minOrderAmount })}
              placeholder="No minimum"
              prefix="₱"
              keyboardType={NUMERIC}
              error={errorFor("minOrderAmount")}
            />
            <View style={styles.row}>
              <View style={styles.flex}>
                <LabeledInput
                  label="Total uses"
                  value={form.usageLimitTotal}
                  onChangeText={(usageLimitTotal) => update({ usageLimitTotal })}
                  placeholder="Unlimited"
                  keyboardType={WHOLE}
                  error={errorFor("usageLimitTotal")}
                />
              </View>
              <View style={styles.flex}>
                <LabeledInput
                  label="Per customer"
                  value={form.usageLimitPerCustomer}
                  onChangeText={(usageLimitPerCustomer) => update({ usageLimitPerCustomer })}
                  placeholder="Unlimited"
                  keyboardType={WHOLE}
                  error={errorFor("usageLimitPerCustomer")}
                />
              </View>
            </View>
            <Text style={styles.scopeHint}>
              Per-customer limits count customers who give a phone number or email.
            </Text>
            <View style={styles.switchRow}>
              <View style={styles.flex}>
                <Text style={styles.switchLabel}>Combine with other codes</Text>
                <Text style={styles.switchHint}>
                  {"Off: this code can't share an order with another. On: each code takes its share of what's left."}
                </Text>
              </View>
              <Switch
                value={form.isStackable}
                onValueChange={(isStackable) => update({ isStackable })}
                trackColor={{ false: colors.separator, true: colors.success }}
                accessibilityLabel="Combine with other codes"
              />
            </View>
          </FormSection>

          <FormSection title="Schedule">
            <DateChoiceField
              label="Starts"
              value={form.startsAt}
              emptyLabel="Right away"
              presets={[{ label: "Tomorrow", iso: startOfDayIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)) }]}
              toIso={startOfDayIso}
              onChange={(startsAt) => update({ startsAt })}
              minimumDate={now}
            />
            <DateChoiceField
              label="Ends"
              value={form.endsAt}
              emptyLabel="No end date"
              presets={END_PRESETS.map((preset) => ({ label: preset.label, iso: endPresetIso(preset.days, now) }))}
              toIso={endOfDayIso}
              onChange={(endsAt) => update({ endsAt })}
              minimumDate={form.startsAt ? new Date(form.startsAt) : now}
              error={errorFor("endsAt")}
            />
          </FormSection>

          <FormSection title="Where it works">
            <OptionPills
              mode="multi"
              options={CHANNEL_OPTIONS}
              isSelected={(channel: VoucherChannel) => form.channels.includes(channel)}
              onSelect={(channel: VoucherChannel) =>
                update({
                  channels: form.channels.includes(channel)
                    ? form.channels.filter((c) => c !== channel)
                    : [...form.channels, channel],
                })
              }
              accessibilityPrefix="Works at"
            />
            {errorFor("channels") ? <Text style={styles.errorText}>{errorFor("channels")}</Text> : null}
          </FormSection>

          {!isNew && loadedVoucher?.isActive ? (
            <Button
              label="Switch off this code"
              tone="ghost"
              onPress={() => handleActive(false)}
              isLoading={isToggling}
              style={styles.switchOff}
              fullWidth
            />
          ) : null}
          {!isNew ? (
            <Text style={styles.footnote}>
              Vouchers are never deleted, so past orders keep a record of their discount.
            </Text>
          ) : null}
        </ScrollView>

        <View style={[styles.saveBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          {errorCount > 0 ? (
            <Text style={styles.saveError}>
              {errorCount === 1 ? "1 thing needs fixing above" : `${errorCount} things need fixing above`}
            </Text>
          ) : null}
          <Button
            label={isNew ? "Create voucher" : "Save changes"}
            onPress={() => void handleSave()}
            isLoading={isSaving}
            disabled={!isNew && !isDirty}
            fullWidth
            size="lg"
          />
        </View>
      </KeyboardAvoidingView>

      {form.scope !== "universal" ? (
        <VoucherTargetSheet
          visible={isPickerOpen}
          kind={form.scope === "categories" ? "categories" : "products"}
          options={targetOptions}
          selected={form.targetIds}
          onClose={() => setIsPickerOpen(false)}
          onDone={(targetIds) => {
            update({ targetIds });
            setIsPickerOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xxl * 2 },
  row: { flexDirection: "row", gap: spacing.md },

  offBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  offText: { ...typography.caption, color: colors.textPrimary, flex: 1 },
  offAction: { ...typography.caption, color: colors.textPrimary, fontWeight: "800", textDecorationLine: "underline" },

  performance: { marginTop: spacing.xxl },
  performanceTitle: { ...typography.heading, color: colors.textPrimary, marginBottom: spacing.md },

  scopeHint: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.md },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.md,
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.surfaceSubtle,
  },
  pickRowError: { borderColor: colors.danger, backgroundColor: colors.dangerLight },
  pickTitle: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  pickNames: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  errorText: { ...typography.caption, color: colors.danger, marginTop: spacing.xs, fontWeight: "600" },

  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.lg },
  switchLabel: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  switchHint: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  switchOff: { marginTop: spacing.xxl },
  footnote: { ...typography.caption, color: colors.textSecondary, textAlign: "center", marginTop: spacing.md },

  saveBar: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  saveError: {
    ...typography.caption,
    color: colors.danger,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: spacing.sm,
  },
});
