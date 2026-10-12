/**
 * One recorded Senior/PWD grant: who, which ID, which order, the money, every
 * flag explained in words, the reviews so far — and Mark OK / Mark as problem.
 *
 * The verdict goes straight to `gov_discount_reviews` with the signed-in
 * user's session; the database stamps the reviewer, so nothing here claims who
 * reviewed it. A problem needs a note so whoever follows it up knows.
 */
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { GOV_DISCOUNT_RULES, maskIdNumber } from "../../lib/gov-discount";
import { formatManilaDateTime, formatPesoCentavos, orderReference } from "../../lib/gov-reports/format";
import { checkReview, REVIEW_NOTE_MAX, visibleFlags } from "../../lib/gov-reports/review-queue";
import type { GrantEntry, ReviewVerdict } from "../../lib/gov-reports/types";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { IconButton } from "../IconButton";
import { Modal } from "../Modal";

interface GrantDetailSheetProps {
  grant: GrantEntry | null;
  onClose: () => void;
  onSubmitReview: (grant: GrantEntry, verdict: ReviewVerdict, note: string | null) => Promise<void>;
}

const SEVERITY_COLORS = {
  high: { bg: colors.dangerLight, fg: colors.danger, word: "Check now" },
  medium: { bg: colors.statusPending.bg, fg: colors.statusPending.text, word: "Worth a look" },
  low: { bg: colors.primaryLight, fg: colors.textPrimary, word: "For your info" },
} as const;

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  );
}

function FlagList({ grant }: { grant: GrantEntry }) {
  const flags = visibleFlags(grant.flags);
  if (flags.length === 0) return <Text style={styles.muted}>No flags. The server agreed with the register.</Text>;
  return (
    <View style={styles.flags}>
      {flags.map((flag) => {
        const tone = SEVERITY_COLORS[flag.severity];
        return (
          <View key={flag.flag} style={[styles.flag, { backgroundColor: tone.bg }]}>
            <Text style={[styles.flagTitle, { color: tone.fg }]}>
              {flag.label} · {tone.word}
            </Text>
            <Text style={[styles.flagText, { color: tone.fg }]}>{flag.explain}</Text>
          </View>
        );
      })}
    </View>
  );
}

function ReviewHistory({ grant }: { grant: GrantEntry }) {
  if (grant.reviews.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Reviews</Text>
      {grant.reviews.map((review) => (
        <View key={review.id} style={styles.review}>
          <Text style={[styles.reviewVerdict, review.verdict === "problem" ? styles.problem : styles.ok]}>
            {review.verdict === "problem" ? "Problem" : "OK"} · {review.reviewerName} ·{" "}
            {formatManilaDateTime(review.createdAt)}
          </Text>
          {review.note ? <Text style={styles.reviewNote}>{review.note}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export function GrantDetailSheet({ grant, onClose, onSubmitReview }: GrantDetailSheetProps) {
  const [isWritingProblem, setIsWritingProblem] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isIdShown, setIsIdShown] = useState(false);

  // The parent keys this sheet on the grant id, so another grant opens on a
  // clean form — never the last one's half-typed note or revealed ID.
  if (!grant) return null;

  const submit = async (verdict: ReviewVerdict) => {
    const check = checkReview({ verdict, note: verdict === "problem" ? note : "" });
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      await onSubmitReview(grant, check.verdict, check.note);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save your review.");
    } finally {
      setIsBusy(false);
    }
  };

  const rule = GOV_DISCOUNT_RULES[grant.kind];
  const idText = isIdShown ? grant.idNumber : maskIdNumber(grant.idNumber);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.backdropFill}
          onPress={onClose}
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
                {grant.claimantName}
              </Text>
              <Text style={styles.subtitle}>
                {rule.label} · {orderReference(grant)} · {formatManilaDateTime(grant.occurredAt, true)}
              </Text>
            </View>
            <IconButton icon="close" label="Close" onPress={onClose} />
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
            {grant.reversedAt ? (
              <View style={styles.reversed}>
                <Text style={styles.reversedText}>
                  Taken back {formatManilaDateTime(grant.reversedAt, true)} by an edit or cancellation
                  {grant.reversedByName ? ` (${grant.reversedByName})` : ""}.
                </Text>
              </View>
            ) : null}

            <View style={styles.section}>
              <View style={styles.idRow}>
                <Line label={rule.idLabel} value={idText} />
                <Button
                  label={isIdShown ? "Hide" : "Show"}
                  tone="ghost"
                  size="sm"
                  onPress={() => setIsIdShown((shown) => !shown)}
                  accessibilityLabel={isIdShown ? "Hide the full ID number" : "Show the full ID number"}
                />
              </View>
              <Line label="Their share" value={formatPesoCentavos(grant.grossShare)} />
              {grant.vatRemoved !== 0 ? <Line label="VAT removed" value={formatPesoCentavos(grant.vatRemoved)} /> : null}
              <Line label={`${rule.ratePercent}% discount`} value={formatPesoCentavos(grant.discount)} />
              <Line label="They paid" value={formatPesoCentavos(grant.netDue)} />
              <Line label="Total off" value={formatPesoCentavos(grant.reduction)} />
              <Line label="Given by" value={grant.grantedByName} />
              <Line label="Approved by" value={grant.approvedByName ?? "No approval"} />
              {grant.allocationMode === "shared" && grant.diners ? (
                <Line label="Shared table" value={`${grant.diners} at the table`} />
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Flags</Text>
              <FlagList grant={grant} />
            </View>

            <ReviewHistory grant={grant} />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Your review</Text>
              {isWritingProblem ? (
                <TextInput
                  style={styles.note}
                  value={note}
                  onChangeText={setNote}
                  placeholder="What is wrong? e.g. the ID did not match the person"
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  maxLength={REVIEW_NOTE_MAX}
                  autoFocus
                  accessibilityLabel="What the problem is"
                />
              ) : null}
              {error ? (
                <Text style={styles.error} accessibilityLiveRegion="polite">
                  {error}
                </Text>
              ) : null}
              <View style={styles.actions}>
                {isWritingProblem ? (
                  <>
                    <Button label="Save problem" tone="danger" onPress={() => void submit("problem")} isLoading={isBusy} fullWidth />
                    <Button label="Cancel" tone="ghost" onPress={() => setIsWritingProblem(false)} disabled={isBusy} fullWidth />
                  </>
                ) : (
                  <>
                    <Button label="Mark OK" icon="check" onPress={() => void submit("ok")} isLoading={isBusy} fullWidth />
                    <Button
                      label="Mark as problem"
                      tone="secondary"
                      icon="warning"
                      onPress={() => setIsWritingProblem(true)}
                      disabled={isBusy}
                      fullWidth
                    />
                  </>
                )}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.scrim },
  backdropFill: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    maxHeight: "90%",
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  headerCopy: { flex: 1 },
  title: { ...typography.title, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  body: { paddingBottom: spacing.xl },
  reversed: { backgroundColor: colors.primaryLight, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  reversedText: { ...typography.caption, color: colors.textPrimary, fontWeight: "600" },
  section: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: { ...typography.heading, color: colors.textPrimary },
  idRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  line: { flex: 1, flexDirection: "row", justifyContent: "space-between", gap: spacing.md, minHeight: 24 },
  lineLabel: { ...typography.caption, color: colors.textSecondary, flexShrink: 1 },
  lineValue: { ...typography.body, fontWeight: "600", color: colors.textPrimary, fontVariant: ["tabular-nums"], textAlign: "right" },
  muted: { ...typography.caption, color: colors.textSecondary },
  flags: { gap: spacing.sm },
  flag: { borderRadius: radius.md, padding: spacing.md, gap: 2 },
  flagTitle: { ...typography.caption, fontWeight: "800" },
  flagText: { ...typography.caption },
  review: { gap: 2 },
  reviewVerdict: { ...typography.caption, fontWeight: "700" },
  problem: { color: colors.danger },
  ok: { color: colors.success },
  reviewNote: { ...typography.caption, color: colors.textPrimary },
  note: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    padding: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    textAlignVertical: "top",
  },
  error: { ...typography.caption, color: colors.danger },
  actions: { gap: spacing.sm },
});
