import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { formatChatDate } from "../../lib/assistant/presentation";
import type { ConversationSummary } from "../../lib/assistant/api";

type Props = {
  chats: ConversationSummary[] | null;
  error: string | null;
  onOpen: (conversationId: string) => void;
  onBack: () => void;
};

/** This person's recent Owl chats in this store; tapping one reopens it. */
export function PastChatsList({ chats, error, onOpen, onBack }: Props) {
  return (
    <View style={styles.stack}>
      <View style={styles.header}>
        <Text style={styles.title}>Past chats</Text>
        <Pressable accessibilityRole="button" onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>Back</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {chats === null && !error ? <ActivityIndicator size="small" color={colors.textSecondary} accessibilityLabel="Loading" /> : null}
      {chats?.length === 0 ? <Text style={styles.empty}>No past chats yet.</Text> : null}
      {chats?.map((chat) => (
        <Pressable
          key={chat.id}
          accessibilityRole="button"
          onPress={() => onOpen(chat.id)}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <Text style={styles.rowTitle} numberOfLines={1}>
            {chat.title ?? "Untitled chat"}
          </Text>
          <Text style={styles.rowDate}>{formatChatDate(chat.updatedAt)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  back: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  error: { fontSize: 14, color: "#8C2A1E", backgroundColor: colors.dangerLight, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, overflow: "hidden" },
  empty: { fontSize: 14, color: colors.textSecondary },
  row: { backgroundColor: colors.card, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator, paddingHorizontal: 12, paddingVertical: 10 },
  rowPressed: { backgroundColor: colors.surfaceSubtle },
  rowTitle: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  rowDate: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
});
