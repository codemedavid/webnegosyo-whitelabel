import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../Icon";
import { colors, radius } from "../../theme/colors";
import { decideAction } from "../../lib/assistant/api";
import { CLOSED_TEXT } from "../../lib/assistant/presentation";
import type { AssistantLink, ConfirmCard } from "../../lib/assistant/types";

type CardState =
  | { phase: "idle" }
  | { phase: "working" }
  | { phase: "applied"; message: string; link: AssistantLink | null }
  | { phase: "closed"; message: string };

type Props = {
  card: ConfirmCard;
  tenantId: string;
  onOpenLink: (link: AssistantLink) => void;
};

function initialState(card: ConfirmCard): CardState {
  const settled = card.status && card.status !== "pending" ? card.status : null;
  if (settled) return { phase: "closed", message: CLOSED_TEXT[settled] ?? "This proposal was already handled." };
  return Date.parse(card.expiresAt) <= Date.now() ? { phase: "closed", message: CLOSED_TEXT.expired } : { phase: "idle" };
}

/** The only path from a proposal to a real change: the owner's own tap. */
export function ConfirmCardView({ card, tenantId, onOpenLink }: Props) {
  const [state, setState] = useState<CardState>(() => initialState(card));
  const isWorking = state.phase === "working";

  const decide = async (decision: "confirm" | "cancel") => {
    setState({ phase: "working" });
    const result = await decideAction(tenantId, card.actionId, decision);
    if (result.status === "applied" && result.message) {
      setState({ phase: "applied", message: result.message, link: result.link ?? null });
      return;
    }
    setState({
      phase: "closed",
      message: result.error ?? CLOSED_TEXT[result.status ?? ""] ?? "Something went wrong. Nothing was changed.",
    });
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>NEEDS YOUR OK</Text>
        <Text style={styles.title}>{card.title}</Text>
      </View>
      <View style={styles.lines}>
        {card.lines.map((line) => (
          <View key={line.label} style={styles.line}>
            <Text style={styles.lineLabel}>{line.label}</Text>
            <Text style={styles.lineValue}>{line.value}</Text>
          </View>
        ))}
      </View>
      <View style={styles.footer}>
        {state.phase === "idle" || state.phase === "working" ? (
          <>
            {card.warning ? <Text style={styles.warning}>{card.warning}</Text> : null}
            <View style={styles.buttons}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: isWorking, busy: isWorking }}
                disabled={isWorking}
                onPress={() => void decide("confirm")}
                style={({ pressed }) => [styles.confirm, (pressed || isWorking) && styles.dimmed]}
              >
                {isWorking ? <ActivityIndicator size="small" color={colors.textOnDark} /> : <Icon name="check" size={14} color={colors.textOnDark} strokeWidth={2.5} />}
                <Text style={styles.confirmText}>Confirm</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: isWorking }}
                disabled={isWorking}
                onPress={() => void decide("cancel")}
                style={({ pressed }) => [styles.cancel, (pressed || isWorking) && styles.dimmed]}
              >
                <Icon name="close" size={14} color={colors.textSecondary} strokeWidth={2.5} />
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </View>
          </>
        ) : state.phase === "applied" ? (
          <View style={styles.appliedStack}>
            <View style={styles.appliedRow}>
              <Icon name="check" size={16} color={colors.success} strokeWidth={2.5} />
              <Text style={styles.appliedText}>{state.message}</Text>
            </View>
            {state.link ? (
              <Pressable accessibilityRole="link" onPress={() => onOpenLink(state.link as AssistantLink)} hitSlop={8}>
                <Text style={styles.linkText}>{state.link.label} →</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Text style={styles.closedText}>{state.message}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: "#FCD34D" },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  eyebrow: { fontSize: 10, fontWeight: "700", letterSpacing: 0.6, color: "#B45309" },
  title: { fontSize: 15, fontWeight: "800", letterSpacing: -0.1, color: colors.textPrimary, marginTop: 2 },
  lines: { paddingHorizontal: 16, paddingBottom: 12, gap: 4 },
  line: { flexDirection: "row", gap: 12 },
  lineLabel: { width: 112, fontSize: 14, color: colors.textSecondary },
  lineValue: { flex: 1, fontSize: 14, fontWeight: "500", color: colors.textPrimary },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator, paddingHorizontal: 16, paddingVertical: 12 },
  warning: { fontSize: 13, color: colors.textSecondary, marginBottom: 8 },
  buttons: { flexDirection: "row", gap: 8 },
  confirm: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: 10, minHeight: 44 },
  confirmText: { fontSize: 14, fontWeight: "600", color: colors.textOnDark },
  cancel: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.full, borderWidth: 1, borderColor: colors.separator, paddingHorizontal: 16, paddingVertical: 10, minHeight: 44 },
  cancelText: { fontSize: 14, fontWeight: "600", color: colors.textSecondary },
  dimmed: { opacity: 0.5 },
  appliedStack: { gap: 6 },
  appliedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  appliedText: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.success },
  linkText: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  closedText: { fontSize: 14, color: colors.textSecondary },
});
