import React from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";

interface SearchFieldProps {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
}

/**
 * Search input with a leading glyph and a clear button.
 *
 * The clear button matters on a filtered list: without it, escaping a
 * no-results state means deleting the query one character at a time.
 */
export function SearchField({
  value,
  onChangeText,
  placeholder = "Search",
}: SearchFieldProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.glyph}>⌕</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      {value.length > 0 ? (
        <TouchableOpacity
          onPress={() => onChangeText("")}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Text style={styles.clear}>✕</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  glyph: { fontSize: 18, color: colors.textTertiary },
  input: {
    flex: 1,
    paddingVertical: 12,
    ...typography.body,
    color: colors.textPrimary,
  },
  clear: { fontSize: 14, color: colors.textTertiary, fontWeight: "700" },
});
