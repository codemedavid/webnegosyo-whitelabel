// AI Growth Coach card for the Growth tab. The merchant types a monthly target,
// taps "Get my scaling plan", and an Alex Hormozi–style advisor streams a
// data-grounded plan (reading the store's real numbers) plus a Messenger CTA
// for a 1:1 consultation. All AI plumbing lives in useGrowthCoach + the
// growth-coach edge function; this component owns only the target input, the
// fact assembly, and rendering. Gated behind real login (demo has no JWT).

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useAuthStore } from "../stores/auth-store";
import { useGrowthCoach } from "../hooks/use-growth-coach";
import {
  buildGrowthCoachFacts,
  parseTargetRevenue,
  type CoachCustomerInput,
  type CoachProductInput,
  type CoachFeatureFlags,
} from "../lib/growth-coach";
import {
  computeScaleTarget,
  type GrowthBottleneck,
  type GrowthSummary,
} from "../lib/growth-metrics";
import { openConsultation } from "../lib/consultation";
import { formatPeso } from "../lib/format";
import { colors, typography, spacing, radius, shadow } from "../theme/colors";

interface GrowthCoachCardProps {
  periodDays: number;
  summary: GrowthSummary;
  bottleneck: GrowthBottleneck;
  marginPercent?: number;
  customers?: CoachCustomerInput;
  products?: CoachProductInput[];
  features?: CoachFeatureFlags;
  /** Prefill from the Scale planner target so the two stay consistent. */
  initialTarget?: number;
}

/** Render a line of the coach's lightweight markdown as a styled row. */
function CoachLine({ line }: { line: string }) {
  const clean = line.replace(/\*\*/g, "").trim();
  if (clean === "") return <View style={styles.answerGap} />;
  if (clean.startsWith("#")) {
    return <Text style={styles.answerHeading}>{clean.replace(/^#+\s*/, "")}</Text>;
  }
  if (/^[-*•]\s/.test(clean)) {
    return (
      <View style={styles.bulletRow}>
        <Text style={styles.bulletDot}>•</Text>
        <Text style={styles.bulletText}>{clean.replace(/^[-*•]\s*/, "")}</Text>
      </View>
    );
  }
  return <Text style={styles.answerBody}>{clean}</Text>;
}

export function GrowthCoachCard({
  periodDays,
  summary,
  bottleneck,
  marginPercent,
  customers,
  products,
  features,
  initialTarget,
}: GrowthCoachCardProps) {
  const isDemo = useAuthStore((s) => s.isDemo);
  const { answer, isStreaming, error, ask } = useGrowthCoach();

  const [targetText, setTargetText] = useState<string>(
    initialTarget ? String(Math.round(initialTarget)) : "",
  );
  const parsedTarget = useMemo(() => parseTargetRevenue(targetText), [targetText]);
  const canAsk = parsedTarget !== null && !isStreaming;

  const handleAsk = () => {
    if (parsedTarget === null) return;
    const scaleTarget = computeScaleTarget({
      targetMonthlyRevenue: parsedTarget,
      avgOrderValue: summary.avgOrderValue,
      avgOrdersPerDay: summary.avgOrdersPerDay,
    });
    const facts = buildGrowthCoachFacts({
      periodDays,
      targetMonthlyRevenue: parsedTarget,
      bottleneck,
      summary,
      scaleTarget,
      marginPercent,
      customers,
      products,
      features,
    });
    void ask(facts);
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>AI</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Growth Coach</Text>
          <Text style={styles.subtitle}>
            Set a monthly target and get a scaling plan from your own numbers.
          </Text>
        </View>
      </View>

      <Text style={styles.inputLabel}>Target monthly revenue</Text>
      <View style={styles.inputRow}>
        <Text style={styles.pesoPrefix}>₱</Text>
        <TextInput
          style={styles.input}
          value={targetText}
          onChangeText={setTargetText}
          placeholder="500,000"
          placeholderTextColor={colors.textTertiary}
          keyboardType="numeric"
          editable={!isStreaming}
          returnKeyType="done"
        />
      </View>
      {parsedTarget !== null && (
        <Text style={styles.targetEcho}>Aiming for {formatPeso(parsedTarget, 0)}/month</Text>
      )}

      {isDemo ? (
        <View style={styles.demoNote}>
          <Text style={styles.demoNoteText}>
            Sign in with a merchant account to unlock your AI growth plan.
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.askButton, !canAsk && styles.askButtonDisabled]}
          onPress={handleAsk}
          disabled={!canAsk}
          activeOpacity={0.85}
        >
          {isStreaming ? (
            <ActivityIndicator color={colors.textOnDark} />
          ) : (
            <Text style={styles.askButtonText}>
              {answer ? "Regenerate plan" : "Get my scaling plan"}
            </Text>
          )}
        </TouchableOpacity>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {answer !== "" && (
        <View style={styles.answer}>
          {answer.split("\n").map((line, i) => (
            <CoachLine key={i} line={line} />
          ))}
          {isStreaming && <Text style={styles.caret}>▍</Text>}
        </View>
      )}

      {answer !== "" && !isStreaming && (
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => void openConsultation()}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaButtonText}>💬  Book a 1:1 consultation</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.separator,
    ...shadow.sm,
  },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.lg, gap: spacing.md },
  badge: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.heroInk,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { ...typography.heading, fontSize: 14, color: colors.heroInkText, fontWeight: "800" },
  headerText: { flex: 1 },
  title: { ...typography.heading, color: colors.textPrimary },
  subtitle: { ...typography.small, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },

  inputLabel: { ...typography.small, fontWeight: "700", color: colors.textSecondary, marginBottom: spacing.xs },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.md,
  },
  pesoPrefix: { ...typography.heading, color: colors.textSecondary, marginRight: spacing.xs },
  input: { flex: 1, ...typography.heading, color: colors.textPrimary, paddingVertical: 12 },
  targetEcho: { ...typography.small, color: colors.textTertiary, marginTop: spacing.xs },

  askButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  askButtonDisabled: { opacity: 0.5 },
  askButtonText: { ...typography.heading, color: colors.textOnDark, fontWeight: "800" },

  demoNote: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  demoNoteText: { ...typography.caption, color: colors.textSecondary },

  errorBox: {
    backgroundColor: colors.dangerLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: { ...typography.caption, color: colors.danger },

  answer: { marginTop: spacing.lg },
  answerGap: { height: spacing.sm },
  answerHeading: {
    ...typography.heading,
    fontSize: 15,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  answerBody: { ...typography.body, color: colors.textPrimary, lineHeight: 21 },
  bulletRow: { flexDirection: "row", gap: spacing.sm, marginVertical: 2 },
  bulletDot: { ...typography.body, color: colors.accent },
  bulletText: { ...typography.body, color: colors.textPrimary, flex: 1, lineHeight: 21 },
  caret: { ...typography.body, color: colors.accent },

  ctaButton: {
    backgroundColor: colors.heroInk,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  ctaButtonText: { ...typography.heading, color: colors.heroInkText, fontWeight: "700" },
});
