import React, { useCallback, useState } from "react";
import { FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { BackHeader } from "../../../components/BackHeader";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorState } from "../../../components/ErrorState";
import { LoadingState } from "../../../components/LoadingState";
import { useAuthStore } from "../../../stores/auth-store";
import { listAnnouncements, listReadAnnouncementIds, type Announcement } from "../../../lib/announcements/service";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";

// The merchant's "What's New" inbox: every published post and notice, newest
// first, unread ones marked. Reached from Account and from a tapped notice
// push; never a tab.

function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function WhatsNewScreen() {
  const userId = useAuthStore((s) => s.userId);
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [announcements, reads] = await Promise.all([
        listAnnouncements(),
        userId ? listReadAnnouncementIds(userId) : Promise.resolve(new Set<string>()),
      ]);
      setItems(announcements);
      setReadIds(reads);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load updates");
    } finally {
      setIsRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const renderItem = ({ item }: { item: Announcement }) => {
    const isUnread = !readIds.has(item.id);
    const isNotice = item.kind === "notice";
    return (
      <TouchableOpacity
        onPress={isNotice ? undefined : () => router.push(`/(main)/whats-new/${item.id}`)}
        activeOpacity={isNotice ? 1 : 0.8}
        accessibilityRole={isNotice ? undefined : "button"}
        accessibilityLabel={`${isUnread ? "Unread: " : ""}${item.title}`}
        style={styles.card}
      >
        {item.coverImageUrl ? (
          <Image source={{ uri: item.coverImageUrl }} style={styles.cover} resizeMode="cover" />
        ) : null}
        <View style={styles.cardBody}>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{isNotice ? "Notice" : "Update"} · {formatDate(item.publishedAt)}</Text>
            {isUnread ? <View style={styles.unreadDot} accessibilityLabel="Unread" /> : null}
          </View>
          <Text style={styles.title}>{item.title}</Text>
          {item.summary ? (
            <Text style={styles.summary} numberOfLines={isNotice ? undefined : 3}>
              {item.summary}
            </Text>
          ) : null}
          {!isNotice ? <Text style={styles.readMore}>Read more</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <BackHeader title="What's New" subtitle="Updates from WebNegosyo" />
      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : items === null ? (
        <LoadingState fullScreen />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                setIsRefreshing(true);
                void load();
              }}
            />
          }
          ListEmptyComponent={
            <EmptyState icon="info" title="Nothing new yet" message="Release notes and announcements will show up here." />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadow.sm,
  },
  cover: { width: "100%", aspectRatio: 16 / 9, backgroundColor: colors.surfaceSubtle },
  cardBody: { padding: spacing.lg, gap: spacing.xs },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  meta: { ...typography.small, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.6 },
  unreadDot: { width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.accent },
  title: { ...typography.heading, color: colors.textPrimary },
  summary: { ...typography.body, color: colors.textSecondary, lineHeight: 21 },
  readMore: { ...typography.caption, color: colors.accent, fontWeight: "700", marginTop: spacing.xs },
});
