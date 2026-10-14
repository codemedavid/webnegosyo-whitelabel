import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { collapseTimeline, hasOpenRequest, toTimelineNodes, type TimelineNode, type TimelineShape, type TimelineTone } from "../../lib/activity/order-history";
import type { StoreActivityEvent } from "../../lib/activity/store-event";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";

const TONE_INK: Readonly<Record<TimelineTone, string>> = {
  success: colors.success,
  warning: colors.statusPending.text,
  danger: colors.statusPreparing.text,
  neutral: colors.textMuted,
};

const DEFAULT_COLLAPSED = 4;

function NodeMark({ shape, tone }: { shape: TimelineShape; tone: TimelineTone }) {
  const ink = TONE_INK[tone];
  if (shape === "cross") return <Icon name="close" size={14} color={ink} strokeWidth={2.5} />;
  if (shape === "diamond") return <View style={[styles.diamond, { backgroundColor: ink }]} />;
  if (shape === "dot") return <View style={[styles.dot, { backgroundColor: ink }]} />;
  return <View style={[styles.ring, { borderColor: ink }]} />;
}

function TimelineRow({ node, isLast }: { node: TimelineNode; isLast: boolean }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={[node.word, node.title, node.amountLabel, node.meta, node.reason].filter(Boolean).join(". ")}>
      <View style={styles.rail}>
        <View style={styles.markBox}>
          <NodeMark shape={node.shape} tone={node.tone} />
        </View>
        {isLast ? null : <View style={styles.line} />}
      </View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={[styles.word, { color: TONE_INK[node.tone] }]}>{node.word}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {node.title}
          </Text>
          {node.amountLabel ? <Text style={styles.amount}>{node.amountLabel}</Text> : null}
        </View>
        <Text style={styles.meta}>{node.meta}</Text>
        {node.reason ? (
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>“{node.reason}”</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

interface OrderHistoryTimelineProps {
  events: readonly StoreActivityEvent[];
  collapsedCount?: number;
}

/**
 * One order's story, oldest at the top (spec §3.5). Every node has a word and
 * a shape as well as a colour. Collapsed to the latest four until "Show all";
 * opened by itself while a request on the order is still waiting.
 */
export function OrderHistoryTimeline({ events, collapsedCount = DEFAULT_COLLAPSED }: OrderHistoryTimelineProps) {
  const [isExpanded, setExpanded] = useState(false);
  const nodes = toTimelineNodes(events);
  const view = collapseTimeline(nodes, { collapsedCount, isExpanded: isExpanded || hasOpenRequest(events) });

  return (
    <View>
      {view.hiddenCount > 0 ? (
        <TouchableOpacity
          onPress={() => setExpanded(true)}
          style={styles.showAll}
          accessibilityRole="button"
          accessibilityLabel={`Show all ${nodes.length} events`}
        >
          <Text style={styles.showAllText}>Show all {nodes.length}</Text>
        </TouchableOpacity>
      ) : null}
      {view.visible.map((node, index) => (
        <TimelineRow key={node.id} node={node} isLast={index === view.visible.length - 1} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.md },
  rail: { width: 16, alignItems: "center" },
  markBox: { height: 22, justifyContent: "center", alignItems: "center" },
  line: { flex: 1, width: 1.5, backgroundColor: colors.separator, marginVertical: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  diamond: { width: 9, height: 9, transform: [{ rotate: "45deg" }] },
  ring: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  copy: { flex: 1, paddingBottom: spacing.md, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: spacing.sm },
  word: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  title: { ...typography.body, fontWeight: "600", color: colors.textPrimary, flexShrink: 1 },
  amount: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  meta: { ...typography.caption, color: colors.textMuted },
  bubble: {
    alignSelf: "flex-start",
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
  },
  bubbleText: { ...typography.caption, color: colors.textPrimary },
  showAll: { minHeight: 44, justifyContent: "center", marginBottom: spacing.xs },
  showAllText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary, textDecorationLine: "underline" },
});
