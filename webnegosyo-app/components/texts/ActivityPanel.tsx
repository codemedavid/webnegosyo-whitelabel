import React, { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";

import { Button } from "../Button";
import { EmptyState } from "../EmptyState";
import { ErrorState } from "../ErrorState";
import { OptionPills } from "../OptionPills";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { automationsApi } from "../../lib/sms-automations/api";
import { ACTIVITY_FILTERS, type ActivityFilter } from "../../lib/sms-automations/activity";
import { useActivityFeed } from "../../lib/sms-automations/use-automations";
import { useNowMs } from "../../lib/use-now-ms";
import { ActivityRow } from "./ActivityRow";
import { isBlockedByDemo } from "./use-automation-switch";

const EMPTY_COPY: Record<ActivityFilter, string> = {
  all: "Texts your automations send, wait to send, or skip show up here.",
  waiting: "Nothing is waiting for your phone.",
  sent: "No texts have gone out yet.",
  not_sent: "Every text went out. Skipped or failed ones show up here, with why.",
};

interface ActivityPanelProps {
  tenantId: string | null;
  /** Texts waiting right now, from the list read — decides the cancel button. */
  waiting: number;
  isActive: boolean;
  /** Changes whenever the list was re-read; the feed starts over with it. */
  refreshKey: number;
  onChanged: () => void;
}

/** Every text, newest first: who got it, what it said, and what became of it. */
export function ActivityPanel({ tenantId, waiting, isActive, refreshKey, onChanged }: ActivityPanelProps) {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [isCancelling, setIsCancelling] = useState(false);
  const feed = useActivityFeed(tenantId, filter, isActive, refreshKey);
  const now = useNowMs();

  const cancelAll = () => {
    if (!tenantId || isBlockedByDemo()) return;
    const run = async () => {
      setIsCancelling(true);
      const result = await automationsApi.cancelWaiting(tenantId);
      setIsCancelling(false);
      if (!result.ok) {
        Alert.alert("Couldn’t cancel", result.error);
        return;
      }
      onChanged();
    };
    Alert.alert(
      `Cancel ${waiting === 1 ? "the waiting text" : `all ${waiting} waiting texts`}?`,
      "They won’t be sent. Your automations stay on and keep texting new guests.",
      [
        { text: "Keep them", style: "cancel" },
        { text: "Cancel texts", style: "destructive", onPress: () => void run() },
      ],
    );
  };

  const list = (() => {
    if (feed.isLoading && feed.items.length === 0) {
      return (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }
    if (feed.error && feed.items.length === 0) {
      return <ErrorState title="Couldn’t load texts" message={feed.error} onRetry={() => void feed.reload()} />;
    }
    if (feed.items.length === 0 && !feed.hasMore) {
      return <EmptyState inset icon="message" title="Nothing here yet" message={EMPTY_COPY[filter]} />;
    }
    return (
      <>
        {feed.items.length > 0 ? (
          <View style={styles.group}>
            {feed.items.map((item, index) => (
              <ActivityRow key={item.id} item={item} now={now} grouped={index < feed.items.length - 1} />
            ))}
          </View>
        ) : (
          <Text style={styles.hint}>None in the latest texts. Load more to look further back.</Text>
        )}
        {feed.error ? <Text style={styles.error}>{feed.error}</Text> : null}
        {feed.hasMore ? (
          <Button
            label="Load more"
            tone="secondary"
            onPress={() => void feed.loadMore()}
            isLoading={feed.isLoadingMore}
            fullWidth
            style={styles.more}
          />
        ) : null}
      </>
    );
  })();

  return (
    <View>
      <OptionPills
        options={ACTIVITY_FILTERS}
        isSelected={(value) => value === filter}
        onSelect={setFilter}
        accessibilityPrefix="Show"
      />
      {waiting > 0 ? (
        <Button
          label={`Cancel all waiting (${waiting})`}
          tone="danger"
          icon="close"
          size="sm"
          onPress={cancelAll}
          isLoading={isCancelling}
          style={styles.cancel}
        />
      ) : null}
      <View style={styles.listWrap}>{list}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  cancel: { marginTop: spacing.md },
  listWrap: { marginTop: spacing.lg },
  loading: { paddingVertical: spacing.xxl * 2, alignItems: "center" },
  group: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: "hidden", ...shadow.sm },
  hint: { ...typography.caption, color: colors.textSecondary, textAlign: "center", marginVertical: spacing.lg },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.md },
  more: { marginTop: spacing.md },
});
