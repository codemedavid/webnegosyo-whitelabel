import React, { useEffect, useState } from "react";
import { Image, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "../stores/auth-store";
import { listAnnouncements, listReadAnnouncementIds, markAnnouncementRead, type Announcement } from "../lib/announcements/service";
import { pickPopupAnnouncement, shouldShowWhatsNew, WHATS_NEW_LIST_ROUTE } from "../lib/announcements/popup";
import { colors, radius, shadow, spacing, typography } from "../theme/colors";
import { Button } from "./Button";

// App-wide "What's New" greeter. Mounted once in the (main) tab layout next to
// GlobalOrderAlerts, so a freshly published post greets the merchant on
// whichever screen they land on. Shows at most one post per session, and
// marks it read whether they open it or dismiss it — a post that keeps
// nagging is worse than one they skipped.

export function WhatsNewPopup() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.userId);
  const isDemo = useAuthStore((s) => s.isDemo);
  const isSuperadmin = useAuthStore((s) => s.isSuperadmin);
  const impersonatedTenantId = useAuthStore((s) => s.impersonatedTenantId);
  const [post, setPost] = useState<Announcement | null>(null);
  const [checkedFor, setCheckedFor] = useState<string | null>(null);

  const isEligible = shouldShowWhatsNew({ isAuthenticated, userId, isDemo, isSuperadmin, impersonatedTenantId });

  useEffect(() => {
    if (!isEligible || !userId || checkedFor === userId) return;
    let cancelled = false;
    setCheckedFor(userId);
    Promise.all([listAnnouncements(), listReadAnnouncementIds(userId)])
      .then(([announcements, readIds]) => {
        if (cancelled) return;
        setPost(pickPopupAnnouncement(announcements, readIds));
      })
      .catch(() => {
        // Nothing to greet with; the inbox screen reports load errors itself.
      });
    return () => {
      cancelled = true;
    };
  }, [isEligible, userId, checkedFor]);

  if (!post || !userId) return null;

  const dismiss = (openAfter: boolean) => {
    const { id } = post;
    setPost(null);
    markAnnouncementRead(id, userId).catch(() => {});
    if (openAfter) router.push(`${WHATS_NEW_LIST_ROUTE}/${id}`);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => dismiss(false)}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          {post.coverImageUrl ? (
            <Image source={{ uri: post.coverImageUrl }} style={styles.cover} resizeMode="cover" />
          ) : null}
          <View style={styles.body}>
            <Text style={styles.eyebrow}>What&apos;s new</Text>
            <Text style={styles.title} accessibilityRole="header">
              {post.title}
            </Text>
            {post.summary ? <Text style={styles.summary}>{post.summary}</Text> : null}
            <View style={styles.actions}>
              <Button label="Read more" onPress={() => dismiss(true)} fullWidth />
              <TouchableOpacity onPress={() => dismiss(false)} accessibilityRole="button" style={styles.later}>
                <Text style={styles.laterText}>Maybe later</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadow.sm,
  },
  cover: { width: "100%", aspectRatio: 16 / 9, backgroundColor: colors.surfaceSubtle },
  body: { padding: spacing.xl, gap: spacing.sm },
  eyebrow: { ...typography.eyebrow, color: colors.accent },
  title: { ...typography.title, color: colors.textPrimary },
  summary: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  actions: { marginTop: spacing.md, gap: spacing.sm },
  later: { alignItems: "center", paddingVertical: spacing.sm },
  laterText: { ...typography.body, color: colors.textSecondary, fontWeight: "600" },
});
