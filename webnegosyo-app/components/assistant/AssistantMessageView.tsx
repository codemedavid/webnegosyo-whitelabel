import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { asToolResult, isToolPart, TOOL_LABELS, toolNameOf, userPhotosOf, userTextOf, WORKING_LABEL } from "../../lib/assistant/presentation";
import type { AssistantLink, AssistantMessage, ToolPart } from "../../lib/assistant/types";
import { AssistantCardView } from "./AssistantCards";
import { ConfirmCardView } from "./ConfirmCardView";
import { SafeTextView } from "./SafeTextView";

type Props = {
  message: AssistantMessage;
  tenantId: string;
  onOpenLink: (link: AssistantLink) => void;
};

function ToolPartView({ part, tenantId, onOpenLink }: { part: ToolPart } & Omit<Props, "message">) {
  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <View style={styles.working}>
        <ActivityIndicator size="small" color={colors.textSecondary} />
        <Text style={styles.mutedSmall}>{TOOL_LABELS[toolNameOf(part)] ?? WORKING_LABEL}</Text>
      </View>
    );
  }
  if (part.state === "output-error") {
    return <Text style={styles.mutedSmall}>That data couldn’t be loaded.</Text>;
  }
  const result = asToolResult(part.output);
  if (!result) return null;
  return (
    <View style={styles.toolStack}>
      {result.card?.type === "confirm" ? (
        <ConfirmCardView card={result.card} tenantId={tenantId} onOpenLink={onOpenLink} />
      ) : (
        <AssistantCardView card={result.card} />
      )}
      {result.links?.length ? (
        <View style={styles.links}>
          {result.links.map((link) => (
            <Pressable key={link.path} accessibilityRole="link" onPress={() => onOpenLink(link)} hitSlop={8}>
              <Text style={styles.linkText}>{link.label} →</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Photos the owner sent: the images this session, only a count once the chat is reopened. */
function UserPhotos({ message }: { message: AssistantMessage }) {
  const { urls, count } = userPhotosOf(message);
  if (urls.length > 0) {
    return (
      <View style={styles.photoRow}>
        {urls.map((url, index) => (
          <Image key={index} source={{ uri: url }} style={styles.photo} alt={`Photo ${index + 1}`} />
        ))}
      </View>
    );
  }
  if (count === 0) return null;
  return <Text style={[styles.mutedSmall, styles.photoCount]}>{count === 1 ? "1 photo sent" : `${count} photos sent`}</Text>;
}

export function AssistantMessageView({ message, tenantId, onOpenLink }: Props) {
  if (message.role === "user") {
    return (
      <View style={styles.userStack}>
        <UserPhotos message={message} />
        <View style={styles.userRow}>
          <Text style={styles.userBubble}>{userTextOf(message)}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.assistantStack}>
      {message.parts.map((part, index) => {
        if (part.type === "text") {
          const text = String((part as { text?: unknown }).text ?? "");
          return text.trim() ? <SafeTextView key={index} text={text} /> : null;
        }
        if (!isToolPart(part)) return null;
        return <ToolPartView key={index} part={part as ToolPart} tenantId={tenantId} onOpenLink={onOpenLink} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  userStack: { gap: 6 },
  userRow: { flexDirection: "row", justifyContent: "flex-end" },
  photoRow: { flexDirection: "row", justifyContent: "flex-end", gap: 6 },
  photo: { width: 80, height: 80, borderRadius: 12, backgroundColor: colors.surfaceSubtle },
  photoCount: { textAlign: "right" },
  userBubble: {
    maxWidth: "85%",
    backgroundColor: colors.primary,
    color: colors.textOnDark,
    fontSize: 15,
    lineHeight: 21,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderBottomRightRadius: 6,
    overflow: "hidden",
  },
  assistantStack: { gap: 10 },
  working: { flexDirection: "row", alignItems: "center", gap: 8 },
  mutedSmall: { fontSize: 13, color: colors.textSecondary },
  toolStack: { gap: 6 },
  links: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 6 },
  linkText: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
});
