import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Icon, type IconName } from "../../Icon";
import { colors, radius, spacing, typography } from "../../../theme/colors";

/**
 * One answer to a step's question, as a card you tap.
 *
 * Used where the merchant picks exactly one thing (who, how often). The
 * selected card gets an ink outline and a filled radio — the same "this one"
 * mark everywhere — and an optional trailing figure such as "42 guests", so
 * the consequence of each choice is visible before it is made.
 */
interface ChoiceCardProps {
  title: string;
  description?: string;
  icon?: IconName;
  isSelected: boolean;
  onPress: () => void;
  /** A short fact on the right, e.g. "42". */
  trailing?: string;
  trailingCaption?: string;
  /** Content shown under the card's text only while selected. */
  children?: React.ReactNode;
}

export function ChoiceCard({
  title,
  description,
  icon,
  isSelected,
  onPress,
  trailing,
  trailingCaption,
  children,
}: ChoiceCardProps) {
  return (
    <View style={[styles.card, isSelected && styles.cardSelected]}>
      <TouchableOpacity
        style={styles.row}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="radio"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={[title, description, trailing && `${trailing} ${trailingCaption ?? ""}`]
          .filter(Boolean)
          .join(". ")}
      >
        <View style={[styles.radio, isSelected && styles.radioSelected]}>
          {isSelected ? <View style={styles.radioDot} /> : null}
        </View>
        {icon ? (
          <Icon
            name={icon}
            size={20}
            color={isSelected ? colors.textPrimary : colors.textSecondary}
          />
        ) : null}
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
        </View>
        {trailing !== undefined ? (
          <View style={styles.trailing}>
            <Text style={[styles.trailingValue, trailing === "0" && styles.trailingZero]}>
              {trailing}
            </Text>
            {trailingCaption ? (
              <Text style={styles.trailingCaption}>{trailingCaption}</Text>
            ) : null}
          </View>
        ) : null}
      </TouchableOpacity>
      {isSelected && children ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  // 2px ink rather than a colour: the selection is a fact, not a decoration.
  cardSelected: { borderColor: colors.primary, borderWidth: 2, margin: -1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    minHeight: 60,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.textTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  copy: { flex: 1, gap: 2 },
  title: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  description: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  trailing: { alignItems: "flex-end" },
  trailingValue: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  trailingZero: { color: colors.textTertiary },
  trailingCaption: { ...typography.small, color: colors.textSecondary },
  body: {
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
});
