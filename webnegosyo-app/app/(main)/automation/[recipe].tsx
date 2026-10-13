import React, { useCallback, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuthStore } from "../../../stores/auth-store";
import { colors, spacing, typography } from "../../../theme/colors";
import { textsHref } from "../../../lib/navigation";
import { goTo, type TabAwareRouter } from "../../../lib/tab-navigation";
import { isTabReachable } from "../../../lib/tab-visibility";
import { useTabVisibilityContext } from "../../../lib/use-tab-visibility-context";
import { automationsApi } from "../../../lib/sms-automations/api";
import { useAutomationsView } from "../../../lib/sms-automations/use-automations";
import {
  draftFromAutomation,
  draftFromRecipe,
  isDraftDirty,
  messageProblem,
  RUN_MODE_OPTIONS,
  toApiDraft,
  type EditorDraft,
} from "../../../lib/sms-automations/editor";
import { storeBaseUrl, type Blocker } from "../../../lib/sms-automations/view";
import { BackHeader } from "../../../components/BackHeader";
import { Button } from "../../../components/Button";
import { OptionPills } from "../../../components/OptionPills";
import { SectionHeader } from "../../../components/SectionHeader";
import { LoadingState } from "../../../components/LoadingState";
import { ErrorState } from "../../../components/ErrorState";
import { KnobSentence } from "../../../components/texts/editor/KnobSentence";
import { MessageEditor } from "../../../components/texts/editor/MessageEditor";
import { MessagePreview } from "../../../components/texts/editor/MessagePreview";
import { AudienceCard } from "../../../components/texts/editor/AudienceCard";
import { TurnOnSheet } from "../../../components/texts/TurnOnSheet";
import { isBlockedByDemo, useAutomationSwitch } from "../../../components/texts/use-automation-switch";

/**
 * One automation, read as a sentence: when it texts, who, and what it says —
 * with the text as a guest's phone shows it and who would get it right now.
 * Saving a NEW one asks "Turn it on?" with the same sheet as the hub.
 */
export default function AutomationEditorScreen() {
  const { recipe } = useLocalSearchParams<{ recipe: string }>();
  const tenantId = useAuthStore((s) => s.tenantId);
  const tenantName = useAuthStore((s) => s.tenantName);
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const isAllowed = isTabReachable("texts", useTabVisibilityContext());
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const query = useAutomationsView(tenantId, isAllowed);
  const view = query.data;
  const info = view?.recipes.find((r) => r.id === recipe) ?? null;
  const saved = view?.automations.find((a) => a.recipe === recipe) ?? null;

  // The screen stays mounted between visits (tab navigator), so the draft is
  // dropped on leaving and rebuilt from the latest read on the next visit.
  const [draft, setDraft] = useState<{ key: string; initial: EditorDraft; form: EditorDraft } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [leaveOnClose, setLeaveOnClose] = useState(false);
  useFocusEffect(
    useCallback(
      () => () => {
        setDraft(null);
        setSaveError(null);
        setLeaveOnClose(false);
      },
      [],
    ),
  );
  const draftKey = `${recipe}|${saved?.id ?? "new"}`;
  if (isFocused && info && draft?.key !== draftKey) {
    const initial = saved ? draftFromAutomation(saved) : draftFromRecipe(info);
    setDraft({ key: draftKey, initial, form: initial });
  }
  const form = draft?.key === draftKey ? draft.form : null;
  const update = (patch: Partial<EditorDraft>) => {
    setDraft((prev) => (prev ? { ...prev, form: { ...prev.form, ...patch } } : prev));
    setSaveError(null);
  };

  const onFix = useCallback((blocker: Blocker) => {
    if (blocker.kind === "review_link") router.navigate(textsHref("rules"));
    else goTo(router as TabAwareRouter<`/(main)/${string}`>, "/(main)/loyalty");
  }, []);
  const { invalidate } = query;
  const onChanged = useCallback(() => void invalidate(), [invalidate]);
  const flow = useAutomationSwitch({ tenantId, view, onChanged, onFix });

  const apiDraft = useMemo(() => (form ? toApiDraft(form) : null), [form]);
  const problem = form && info ? messageProblem(form.messageTemplate, info.variables) : null;
  const isDirty = draft && form ? isDraftDirty(draft.initial, form) : false;

  const leave = () => {
    if (!isDirty) {
      router.back();
      return;
    }
    Alert.alert("Discard changes?", "Your edits to this automation haven’t been saved.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  };

  const save = async () => {
    if (!tenantId || !form || !info || !apiDraft || problem || isBlockedByDemo()) return;
    setIsSaving(true);
    setSaveError(null);
    const result = await automationsApi.save(tenantId, apiDraft);
    setIsSaving(false);
    if (!result.ok) {
      setSaveError(result.error);
      return;
    }
    setDraft((prev) => (prev ? { ...prev, initial: prev.form } : prev));
    await invalidate();
    if (!result.value.created) {
      router.back();
      return;
    }
    setLeaveOnClose(true);
    const target = { automationId: result.value.id, name: form.name ?? info.title, draft: apiDraft, runMode: form.runMode };
    flow.open(target, "turn_on", info.id);
  };

  const body = (() => {
    if (!isAllowed) return <ErrorState title="Texts aren’t available on this account" message="Ask the owner for guest-list access." />;
    if (!view) {
      if (query.error) return <ErrorState title="Couldn’t load this automation" message={query.error} onRetry={() => void query.refetch()} />;
      return <LoadingState message="Loading…" />;
    }
    if (!info) return <ErrorState title="This automation doesn’t exist" message="Go back and pick one from Texts." />;
    if (!form || !apiDraft) return <LoadingState message="Loading…" />;
    return (
      <>
        <KnobSentence info={info} draft={form} onChange={(params) => update({ params })} />
        <SectionHeader title="Message" />
        <MessageEditor tenantId={tenantId} info={info} value={form.messageTemplate} problem={problem} onChange={(messageTemplate) => update({ messageTemplate })} />
        <SectionHeader title="What guests see" hint="With a sample guest’s details" />
        <MessagePreview template={form.messageTemplate} storeName={tenantName ?? "Your store"} baseUrl={storeBaseUrl(tenantSlug)} />
        <View style={styles.gap} />
        <AudienceCard tenantId={tenantId} draft={apiDraft} isMessageBroken={problem !== null} />
        <SectionHeader title="When it sends" />
        <OptionPills
          options={RUN_MODE_OPTIONS}
          isSelected={(mode) => mode === form.runMode}
          onSelect={(runMode) => update({ runMode })}
          accessibilityPrefix="Send"
        />
      </>
    );
  })();

  const canSave = !!form && problem === null && (!saved || isDirty);
  return (
    <View style={styles.screen}>
      <BackHeader title={saved?.name ?? info?.title ?? "Automation"} subtitle={info?.pitch} onBack={leave} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
        {form && info ? (
          <View style={[styles.footer, { paddingBottom: spacing.md + insets.bottom }]}>
            {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
            {problem ? <Text style={styles.error}>{problem}</Text> : null}
            <View style={styles.footerRow}>
              {saved && saved.status === "on" ? (
                <Button label="Run now" tone="secondary" icon="send" onPress={() => flow.runNow(saved)} disabled={isDirty} style={styles.flex} fullWidth />
              ) : null}
              <Button
                label={saved ? "Save changes" : "Save"}
                onPress={() => void save()}
                isLoading={isSaving}
                disabled={!canSave}
                style={styles.flex}
                fullWidth
              />
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
      {view ? (
        <TurnOnSheet
          view={view}
          {...flow.sheetProps}
          onClose={() => {
            flow.sheetProps.onClose();
            if (leaveOnClose) router.back();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl * 2 },
  gap: { height: spacing.md },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  footerRow: { flexDirection: "row", gap: spacing.md },
  error: { ...typography.caption, color: colors.danger, lineHeight: 18 },
});
