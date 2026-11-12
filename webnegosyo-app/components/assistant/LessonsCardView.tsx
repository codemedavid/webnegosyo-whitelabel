import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../../theme/colors";
import type { AssistantLink, LessonsCard } from "../../lib/assistant/types";

/** The video hosts University lessons use; anything else is never opened. */
const VIDEO_HOSTS = new Set(["www.youtube.com", "youtube.com", "youtu.be", "vimeo.com", "www.loom.com", "loom.com"]);

export function isLessonVideoUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && VIDEO_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

type Props = { card: LessonsCard; onOpenLink: (link: AssistantLink) => void };

/**
 * University lessons Owl found (web: lessons-card.tsx). The app has no video
 * player module, so "Watch" opens the video's own page; "Open" opens the
 * lesson on the web admin, like every other web-only Owl link.
 */
export function LessonsCardView({ card, onOpenLink }: Props) {
  const lessons = Array.isArray(card.lessons) ? card.lessons.filter((lesson) => typeof lesson.path === "string" && lesson.path.startsWith("/learn/")) : [];
  if (lessons.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{card.title}</Text>
      {lessons.map((lesson) => (
        <View key={lesson.path} style={styles.row}>
          <View style={styles.body}>
            <Text style={styles.lessonTitle} numberOfLines={2}>
              {lesson.title}
            </Text>
            {lesson.detail ? <Text style={styles.detail}>{lesson.detail}</Text> : null}
          </View>
          {isLessonVideoUrl(lesson.watchUrl) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Watch ${lesson.title}`}
              onPress={() => void Linking.openURL(lesson.watchUrl as string)}
              style={styles.watch}
              hitSlop={6}
            >
              <Text style={styles.watchText}>▶ Watch</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="link" onPress={() => onOpenLink({ label: lesson.title, path: lesson.path })} hitSlop={8}>
            <Text style={styles.open}>Open →</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator, padding: 16, gap: 10 },
  title: { fontSize: 14, fontWeight: "800", letterSpacing: -0.1, color: colors.textPrimary },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  body: { flex: 1, minWidth: 0 },
  lessonTitle: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  detail: { fontSize: 11, color: colors.textSecondary },
  watch: { backgroundColor: colors.textPrimary, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  watchText: { fontSize: 12, fontWeight: "700", color: colors.card },
  open: { fontSize: 12, fontWeight: "600", color: colors.textPrimary },
});
