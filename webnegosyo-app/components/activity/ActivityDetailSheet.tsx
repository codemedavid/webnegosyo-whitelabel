import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { ActivityRpcClient } from "../../lib/activity/activity-repo";
import { describeActivity } from "../../lib/activity/describe";
import { canReviewEvent, detailFacts, openTarget, reviewedLine, type ReviewViewer } from "../../lib/activity/detail-facts";
import type { ActivitySubjectFilter } from "../../lib/activity/filters";
import type { StoreActivityEvent } from "../../lib/activity/store-event";
import { FLAG_COPY } from "../../lib/activity/taxonomy";
import { useSubjectActivity } from "../../lib/activity/use-activity-summary";
import { useMarkReviewed } from "../../lib/activity/use-mark-reviewed";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { DrawerSheet } from "../drawer/DrawerSheet";
import { Icon } from "../Icon";
import { OrderHistoryTimeline } from "../order/OrderHistoryTimeline";

/** The related timeline shows the latest few; "See full history" opens the rest. */
const RELATED_EVENTS = 5;

interface ActivityDetailSheetProps {
  event: StoreActivityEvent | null;
  tenantId: string | null;
  client: ActivityRpcClient;
  nowIso: string;
  viewer: ReviewViewer;
  onClose: () => void;
  onOpen: (href: string) => void;
  /** Absent on the own-only screen, which has no store feed to open. */
  onSeeHistory?: (subject: ActivitySubjectFilter) => void;
}

function FlagCallout({ event }: { event: StoreActivityEvent }) {
  const reviewed = reviewedLine(event);
  return (
    <View style={styles.callout} accessibilityRole="summary">
      <View style={styles.calloutHead}>
        <Icon name="warning" size={16} color={colors.statusPending.text} strokeWidth={2.25} />
        <Text style={styles.calloutTitle}>{"Why it's flagged"}</Text>
      </View>
      {event.flags.map((flag) => (
        <Text key={flag} style={styles.calloutText}>
          {FLAG_COPY[flag].explanation}
        </Text>
      ))}
      {reviewed ? <Text style={styles.reviewed}>{reviewed}</Text> : null}
    </View>
  );
}

function subjectOf(event: StoreActivityEvent): ActivitySubjectFilter | null {
  if (!event.subjectType || !event.subjectRef) return null;
  return { type: event.subjectType, ref: event.subjectRef, label: event.orderNumber ?? describeActivity(event).title };
}

/**
 * One event, in full (spec §3.3): what happened, why it is flagged, the
 * facts (seconds only here), the subject's recent history, and the way to
 * the order or item. No Edit, no Delete, no Approve.
 */
export function ActivityDetailSheet({ event, tenantId, client, nowIso, viewer, onClose, onOpen, onSeeHistory }: ActivityDetailSheetProps) {
  const subject = event ? subjectOf(event) : null;
  const related = useSubjectActivity(
    tenantId && subject ? { tenantId, subjectType: subject.type, subjectRef: subject.ref, since: null } : null,
    { client },
  );
  const review = useMarkReviewed(client, tenantId);
  const described = useMemo(() => (event ? describeActivity(event, { showBranch: false }) : null), [event]);
  if (!event || !described) return null;

  const facts = detailFacts(event, nowIso);
  const target = openTarget(event);
  const canReview = canReviewEvent(event, viewer);
  const latest = related.events.slice(0, RELATED_EVENTS);

  return (
    <DrawerSheet visible title={described.title} subtitle={[described.amountLabel, described.subtitle].filter(Boolean).join(" · ") || undefined} onClose={onClose} closeLabel="Close" isBusy={review.isMarking}>
      {event.flags.length > 0 ? <FlagCallout event={event} /> : null}

      <View style={styles.facts}>
        {facts.map((fact, index) => (
          <View key={fact.label} style={[styles.fact, index > 0 && styles.factDivider]} accessible accessibilityLabel={`${fact.label}: ${fact.value}`}>
            <Text style={styles.factLabel}>{fact.label}</Text>
            <Text style={styles.factValue}>{fact.value}</Text>
          </View>
        ))}
      </View>

      {subject && latest.length > 1 ? (
        <View style={styles.related}>
          <Text style={styles.relatedTitle}>{subject.type === "order" ? "This order" : "This item"}</Text>
          <OrderHistoryTimeline events={latest} collapsedCount={RELATED_EVENTS} />
          {onSeeHistory ? (
            <TouchableOpacity onPress={() => onSeeHistory(subject)} style={styles.link} accessibilityRole="button">
              <Text style={styles.linkText}>See full history</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {review.error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {review.error}
        </Text>
      ) : null}

      <View style={styles.dock}>
        {target ? <Button label={target.label} tone="secondary" onPress={() => onOpen(target.href)} /> : null}
        {canReview ? (
          <Button label="Mark reviewed" icon="check" onPress={() => void review.mark(event.id)} isLoading={review.isMarking} />
        ) : null}
      </View>
    </DrawerSheet>
  );
}

const styles = StyleSheet.create({
  callout: {
    gap: spacing.xs,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.statusPending.bg,
  },
  calloutHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  calloutTitle: { ...typography.body, fontWeight: "700", color: colors.statusPending.text },
  calloutText: { ...typography.body, color: colors.textPrimary },
  reviewed: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  facts: { borderRadius: radius.md, backgroundColor: colors.card, paddingHorizontal: spacing.md },
  fact: { paddingVertical: spacing.sm + 2, gap: 2 },
  factDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  factLabel: { ...typography.caption, color: colors.textMuted },
  factValue: { ...typography.body, color: colors.textPrimary },
  related: { marginTop: spacing.lg },
  relatedTitle: { ...typography.heading, color: colors.textPrimary, marginBottom: spacing.sm },
  link: { minHeight: 44, justifyContent: "center" },
  linkText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary, textDecorationLine: "underline" },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.md },
  dock: { gap: spacing.sm, marginTop: spacing.lg },
});
