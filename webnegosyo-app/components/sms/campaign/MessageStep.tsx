import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from "react-native";
import type { CampaignCost } from "../../../lib/sms/campaign-form";
import { insertToken, type TextSelection } from "../../../lib/sms/campaign-wizard";
import { Icon } from "../../Icon";
import { MessagePreview } from "../MessagePreview";
import { StepIntro } from "./StepIntro";
import { colors, radius, spacing, typography } from "../../../theme/colors";

type PreviewProps = React.ComponentProps<typeof MessagePreview>;

/**
 * The placeholders, as things to tap rather than syntax to remember.
 *
 * A merchant who mistypes `{{frstName}}` gets that literal string delivered to
 * several hundred people. Offering them as buttons removes the only spelling
 * in this flow that has a bill attached to getting it wrong.
 */
const TOKENS = [
  { token: "{{firstName}}", label: "First name" },
  { token: "{{storeName}}", label: "Store name" },
  { token: "{{orderCount}}", label: "No. of orders" },
  { token: "{{lastOrderDate}}", label: "Last visit" },
];

/** Characters per SMS: one part, then each part of a longer message. */
const CAPACITY = {
  GSM7: { single: 160, multipart: 153 },
  UCS2: { single: 70, multipart: 67 },
} as const;

interface MessageStepProps {
  name: string;
  messageTemplate: string;
  nameError?: string;
  messageError?: string;
  cost: CampaignCost;
  preview: Omit<PreviewProps, "cost">;
  onChangeName: (name: string) => void;
  onChangeMessage: (template: string) => void;
}

export function MessageStep({
  name,
  messageTemplate,
  nameError,
  messageError,
  cost,
  preview,
  onChangeName,
  onChangeMessage,
}: MessageStepProps) {
  const [selection, setSelection] = useState<TextSelection | null>(null);
  // Set only right after a chip inserts text, so the cursor lands after the
  // token; cleared on the next native selection event so typing stays free.
  const [pendingCursor, setPendingCursor] = useState<TextSelection | undefined>();

  const handleSelection = (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    setSelection(event.nativeEvent.selection);
    setPendingCursor(undefined);
  };

  const addToken = (token: string) => {
    const result = insertToken(messageTemplate, selection, token);
    onChangeMessage(result.text);
    const cursor = { start: result.cursor, end: result.cursor };
    setSelection(cursor);
    setPendingCursor(cursor);
  };

  const capacity = CAPACITY[cost.encoding];
  const limit =
    cost.segmentsPerMessage <= 1 ? capacity.single : capacity.multipart * cost.segmentsPerMessage;
  const fill = Math.min(1, cost.characters / limit);
  const isLong = cost.segmentsPerMessage > 1;

  return (
    <View style={styles.wrap}>
      <StepIntro
        title="Write your message"
        hint="Keep it short and friendly. Tap a chip to add each guest's own details."
      />

      <MessagePreview {...preview} cost={cost} isCompact />

      <View style={styles.composer}>
        <TextInput
          style={styles.textarea}
          value={messageTemplate}
          onChangeText={onChangeMessage}
          onSelectionChange={handleSelection}
          selection={pendingCursor}
          placeholder="Hi {{firstName}}, we miss you at {{storeName}}!"
          placeholderTextColor={colors.textSecondary}
          multiline
          accessibilityLabel="Message"
        />
        <View style={styles.tokenRow}>
          {TOKENS.map(({ token, label }) => (
            <TouchableOpacity
              key={token}
              style={styles.token}
              onPress={() => addToken(token)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Add ${label}`}
            >
              <Icon name="plus" size={12} color={colors.textPrimary} strokeWidth={2.25} />
              <Text style={styles.tokenText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.meter}>
          <View style={styles.meterTrack}>
            <View
              style={[
                styles.meterFill,
                { width: `${Math.max(fill * 100, cost.characters > 0 ? 3 : 0)}%` },
                isLong && styles.meterFillLong,
              ]}
            />
          </View>
          <Text style={[styles.meterText, isLong && styles.meterTextLong]}>
            {cost.characters}/{limit} · {cost.segmentsPerMessage} SMS per guest
          </Text>
        </View>
      </View>
      {messageError ? <Text style={styles.error}>{messageError}</Text> : null}
      {isLong && !messageError ? (
        <Text style={styles.hint}>
          Longer than one text, so each guest costs {cost.segmentsPerMessage} SMS. Trim it to
          halve the cost.
        </Text>
      ) : null}

      <View style={styles.field}>
        <Text style={styles.label}>Campaign name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={onChangeName}
          placeholder="e.g. Win back lapsed guests"
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel="Campaign name"
        />
        <Text style={nameError ? styles.error : styles.hint}>
          {nameError ?? "Only you see this — guests never do."}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  composer: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    overflow: "hidden",
  },
  textarea: {
    ...typography.body,
    color: colors.textPrimary,
    minHeight: 112,
    lineHeight: 22,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    textAlignVertical: "top",
  },
  tokenRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  token: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    minHeight: 34,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
  },
  tokenText: { ...typography.caption, color: colors.textPrimary, fontWeight: "700" },
  meter: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surfaceSubtle,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  meterTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.separator,
    overflow: "hidden",
  },
  meterFill: { height: 4, borderRadius: 2, backgroundColor: colors.success },
  meterFillLong: { backgroundColor: colors.warning },
  meterText: {
    ...typography.small,
    color: colors.textSecondary,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  meterTextLong: { color: colors.textPrimary },
  field: { gap: 6 },
  label: { ...typography.caption, color: colors.textPrimary, fontWeight: "700" },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    ...typography.body,
    color: colors.textPrimary,
  },
  hint: { ...typography.small, color: colors.textSecondary, lineHeight: 16 },
  error: { ...typography.small, color: colors.danger, fontWeight: "600", lineHeight: 16 },
});
