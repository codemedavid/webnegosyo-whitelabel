import React, { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { BackHeader } from "../../../components/BackHeader";
import { ErrorState } from "../../../components/ErrorState";
import { LoadingState } from "../../../components/LoadingState";
import { AnnouncementBlocks } from "../../../components/AnnouncementBlocks";
import { useAuthStore } from "../../../stores/auth-store";
import { fetchAnnouncement, markAnnouncementRead, type Announcement } from "../../../lib/announcements/service";
import { colors, spacing, typography } from "../../../theme/colors";

// One "What's New" post, read top to bottom. Opening it files the read
// receipt, which is what stops the popup from greeting with it again.

function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function AnnouncementDetailScreen() {
  const { announcementId } = useLocalSearchParams<{ announcementId: string }>();
  const userId = useAuthStore((s) => s.userId);
  const isDemo = useAuthStore((s) => s.isDemo);
  const [post, setPost] = useState<Announcement | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!announcementId) return;
    let cancelled = false;
    setError(null);
    fetchAnnouncement(announcementId)
      .then((loaded) => {
        if (cancelled) return;
        setPost(loaded);
        if (loaded && userId && !isDemo) markAnnouncementRead(loaded.id, userId).catch(() => {});
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load this update");
      });
    return () => {
      cancelled = true;
    };
  }, [announcementId, userId, isDemo]);

  return (
    <View style={styles.screen}>
      <BackHeader title={post?.title ?? "What's New"} />
      {error ? (
        <ErrorState message={error} />
      ) : post === undefined ? (
        <LoadingState fullScreen />
      ) : post === null ? (
        <ErrorState message="This update is no longer available." />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {post.coverImageUrl ? (
            <Image source={{ uri: post.coverImageUrl }} style={styles.cover} resizeMode="cover" />
          ) : null}
          <Text style={styles.date}>{formatDate(post.publishedAt)}</Text>
          <Text style={styles.title} accessibilityRole="header">
            {post.title}
          </Text>
          {post.summary ? <Text style={styles.summary}>{post.summary}</Text> : null}
          {post.isBodyUnreadable ? (
            <Text style={styles.unreadable}>This update couldn&apos;t be displayed. Please check back later.</Text>
          ) : (
            <AnnouncementBlocks blocks={post.blocks} />
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  cover: { width: "100%", aspectRatio: 16 / 9, borderRadius: 16, backgroundColor: colors.surfaceSubtle },
  date: { ...typography.small, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.6 },
  title: { ...typography.title, color: colors.textPrimary },
  summary: { ...typography.body, color: colors.textSecondary, lineHeight: 22, marginBottom: spacing.sm },
  unreadable: { ...typography.body, color: colors.textSecondary },
});
