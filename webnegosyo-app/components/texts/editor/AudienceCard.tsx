import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { automationsApi, type AutomationDraft, type AutomationPreview } from "../../../lib/sms-automations/api";
import { audienceText, topSkipReasons } from "../../../lib/sms-automations/view";

/** Long enough that a run of stepper taps is one preview, short enough to feel live. */
const PREVIEW_DEBOUNCE_MS = 600;
const SAMPLE_NAMES = 5;

interface AudienceCardProps {
  tenantId: string | null;
  draft: AutomationDraft;
  /** A message the server would refuse; the card waits for a fix instead of asking. */
  isMessageBroken: boolean;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; preview: AutomationPreview }
  | { kind: "failed"; error: string };

/** Who this automation would text right now, re-asked a moment after every change. */
export function AudienceCard({ tenantId, draft, isMessageBroken }: AudienceCardProps) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const request = useRef(0);
  const key = JSON.stringify(draft);

  useEffect(() => {
    if (!tenantId || isMessageBroken) return;
    const mine = ++request.current;
    const timer = setTimeout(() => {
      void automationsApi.preview(tenantId, JSON.parse(key) as AutomationDraft).then((result) => {
        if (mine !== request.current) return;
        setState(result.ok ? { kind: "ready", preview: result.value } : { kind: "failed", error: result.error });
      });
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [tenantId, key, isMessageBroken]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Who gets this</Text>
      {isMessageBroken ? (
        <Text style={styles.muted}>Fix the message to see who gets it.</Text>
      ) : state.kind === "loading" ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Checking your guests…</Text>
        </View>
      ) : state.kind === "failed" ? (
        <Text style={styles.error}>{state.error}</Text>
      ) : (
        <Audience preview={state.preview} />
      )}
    </View>
  );
}

function Audience({ preview }: { preview: AutomationPreview }) {
  const report = preview.now;
  const qualifying = report?.qualifying ?? 0;
  const queued = report?.queued ?? 0;
  const names = (report?.sample ?? []).slice(0, SAMPLE_NAMES);
  const reasons = topSkipReasons(report?.skipped ?? {});
  return (
    <>
      <Text style={styles.big}>
        {qualifying === 1 ? "1 guest qualifies right now" : `${qualifying} guests qualify right now`}
      </Text>
      {qualifying > 0 && queued !== qualifying ? (
        <Text style={styles.line}>{queued === 1 ? "1 would get a text" : `${queued} would get a text`}</Text>
      ) : null}
      {names.length > 0 ? <Text style={styles.line}>Like {names.join(", ")}</Text> : null}
      {reasons.length > 0 ? (
        <View style={styles.reasons}>
          <Text style={styles.muted}>Not texted:</Text>
          {reasons.map((reason) => (
            <Text key={reason} style={styles.reason}>{reason}</Text>
          ))}
        </View>
      ) : null}
      <Text style={styles.muted}>{audienceText(preview.audience)}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, ...shadow.sm },
  title: { ...typography.heading, color: colors.textPrimary },
  loading: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  big: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  line: { ...typography.caption, color: colors.textPrimary, lineHeight: 18 },
  reasons: { gap: 2 },
  reason: { ...typography.caption, color: colors.textPrimary, lineHeight: 18 },
  muted: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  error: { ...typography.caption, color: colors.danger, lineHeight: 18 },
});
