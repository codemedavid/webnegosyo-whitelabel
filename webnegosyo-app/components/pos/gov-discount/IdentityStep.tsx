import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { GOV_DISCOUNT_RULES } from "../../../lib/gov-discount";
import { checkDraft, type ClaimantDraft } from "../../../lib/pos-gov-draft";

type Props = {
  draft: ClaimantDraft;
  onChange: (draft: ClaimantDraft) => void;
  onSubmit: () => void;
};

/**
 * Step 2 — the name and ID number BIR needs on every discounted sale
 * (RR 7-2010 §7). Errors appear only after a field is left, so the cashier is
 * not scolded mid-word.
 */
export function IdentityStep({ draft, onChange, onSubmit }: Props) {
  const [touched, setTouched] = useState({ name: false, idNumber: false });
  const rule = GOV_DISCOUNT_RULES[draft.kind];
  const check = checkDraft(draft);

  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <Text style={styles.label}>Name on the ID</Text>
        <TextInput
          style={[styles.input, touched.name && check.name ? styles.inputError : null]}
          value={draft.name}
          onChangeText={(name) => onChange({ ...draft, name })}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          placeholder="e.g. Juan Dela Cruz"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="next"
          autoFocus
          accessibilityLabel="Name on the ID"
        />
        {touched.name && check.name ? <Text style={styles.error}>{check.name}</Text> : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{rule.idLabel}</Text>
        <TextInput
          style={[styles.input, styles.idInput, touched.idNumber && check.idNumber ? styles.inputError : null]}
          value={draft.idNumber}
          onChangeText={(idNumber) => onChange({ ...draft, idNumber })}
          onBlur={() => setTouched((t) => ({ ...t, idNumber: true }))}
          placeholder={rule.idPlaceholder}
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={onSubmit}
          accessibilityLabel={rule.idLabel}
        />
        {touched.idNumber && check.idNumber ? <Text style={styles.error}>{check.idNumber}</Text> : null}
        {check.idHint ? <Text style={styles.hint}>{check.idHint}</Text> : null}
      </View>

      <Text style={styles.footnote}>
        Check the photo on the card. The name and number print on the receipt and go to the
        store’s Senior/PWD sales book.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  field: { gap: spacing.xs },
  label: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
  input: {
    ...typography.body,
    fontSize: 17,
    color: colors.textPrimary,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  idInput: { letterSpacing: 1, fontVariant: ["tabular-nums"] },
  inputError: { borderColor: colors.danger },
  error: { ...typography.caption, color: colors.danger },
  hint: { ...typography.caption, color: colors.warning, fontWeight: "600" },
  footnote: { ...typography.caption, color: colors.textSecondary },
});
