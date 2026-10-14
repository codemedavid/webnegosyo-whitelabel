import React, { useCallback, useMemo } from "react";
import { RefreshControl, SectionList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { BackHeader } from "../../components/BackHeader";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { Icon } from "../../components/Icon";
import { ingredientHref } from "../../lib/navigation";
import {
  describeStockNotification,
  formatNotificationTime,
  groupNotificationsByDay,
  openStockIssueCount,
  type MerchantNotification,
} from "../../lib/merchant-notifications/merchant-notifications";
import {
  useMarkSeenOnVisit,
  useMerchantNotifications,
} from "../../lib/merchant-notifications/use-merchant-notifications";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";

// The bell's list: low-stock and out-of-stock notices, newest first. Opening
// it clears the badge; rows that arrived since the last visit keep a dot for
// this visit so the merchant can still see what was new.

function isNewSince(item: MerchantNotification, highlightSince: string | null): boolean {
  if (highlightSince === null) return false;
  if (highlightSince === "") return !item.isResolved;
  return !item.isResolved && Date.parse(item.createdAt) > Date.parse(highlightSince);
}

function NotificationRow({ item, isNew, now }: { item: MerchantNotification; isNew: boolean; now: Date }) {
  const { title, body } = describeStockNotification(item);
  const isOut = item.kind === "stock_out";
  const tint = item.isResolved ? colors.textTertiary : isOut ? colors.danger : colors.warning;
  const tintBg = item.isResolved ? colors.surfaceSubtle : isOut ? colors.dangerLight : colors.warningLight;
  const itemId = item.inventoryItemId;

  return (
    <TouchableOpacity
      style={[styles.row, isNew && styles.rowNew]}
      activeOpacity={itemId ? 0.8 : 1}
      onPress={itemId ? () => router.push(ingredientHref(itemId)) : undefined}
      accessibilityRole={itemId ? "button" : undefined}
      accessibilityLabel={`${isNew ? "New: " : ""}${title}. ${body}${item.isResolved ? ". Restocked" : ""}`}
    >
      <View style={[styles.iconWrap, { backgroundColor: tintBg }]}>
        <Icon name={isOut ? "warning" : "stock"} size={20} color={tint} />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={[styles.title, item.isResolved && styles.titleResolved]} numberOfLines={2}>
            {title}
          </Text>
          {isNew ? <View style={styles.newDot} /> : null}
        </View>
        <Text style={styles.body}>{body}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{formatNotificationTime(item.createdAt, now)}</Text>
          {item.isResolved ? <Text style={styles.restocked}>Restocked</Text> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function OpenIssuesBanner({ count }: { count: number }) {
  if (count === 0) return null;
  const noun = count === 1 ? "ingredient needs" : "ingredients need";
  return (
    <TouchableOpacity
      style={styles.banner}
      activeOpacity={0.8}
      onPress={() => router.push("/(main)/inventory")}
      accessibilityRole="button"
      accessibilityLabel={`${count} ${noun} restocking. Open Stock`}
    >
      <Icon name="stock" size={20} color={colors.textPrimary} />
      <Text style={styles.bannerText}>
        {count} {noun} restocking
      </Text>
      <Text style={styles.bannerAction}>Open Stock</Text>
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const { inbox, isLoading, isRefetching, error, refetch } = useMerchantNotifications();
  const highlightSince = useMarkSeenOnVisit(inbox);

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch])
  );

  const now = new Date();
  const items = inbox?.items;
  const sections = useMemo(
    () =>
      groupNotificationsByDay(items ?? [], new Date()).map((group) => ({
        title: group.title,
        data: group.items,
      })),
    [items]
  );
  const openCount = useMemo(() => openStockIssueCount(items ?? []), [items]);

  return (
    <View style={styles.screen}>
      <BackHeader title="Notifications" subtitle="Low stock and running out" />
      {error && !inbox ? (
        <ErrorState message={error} onRetry={() => void refetch()} />
      ) : isLoading && !inbox ? (
        <LoadingState fullScreen />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <NotificationRow item={item} isNew={isNewSince(item, highlightSince)} now={now} />
          )}
          renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
          ListHeaderComponent={<OpenIssuesBanner count={openCount} />}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
          ListEmptyComponent={
            <EmptyState
              icon="stock"
              title="You're all caught up"
              message="We'll let you know here when an ingredient runs low or runs out."
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl * 2 },
  sectionTitle: {
    ...typography.small,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.warningLight,
  },
  bannerText: { ...typography.body, color: colors.textPrimary, fontWeight: "600", flex: 1 },
  bannerAction: { ...typography.caption, color: colors.accent, fontWeight: "700" },
  row: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    ...shadow.sm,
  },
  rowNew: { borderWidth: 1, borderColor: colors.accentLight },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, gap: 2 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { ...typography.heading, color: colors.textPrimary, flex: 1 },
  titleResolved: { color: colors.textSecondary },
  newDot: { width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.accent },
  body: { ...typography.caption, color: colors.textSecondary },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  meta: { ...typography.small, color: colors.textTertiary },
  restocked: { ...typography.small, color: colors.success, fontWeight: "700" },
});
