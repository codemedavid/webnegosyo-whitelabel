import React from "react";
import { Pressable, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { Icon } from "../Icon";
import { deletionStyles as styles } from "./styles";

interface CheckRowProps {
  isChecked: boolean;
  onToggle: () => void;
  label: string;
  hint?: string;
}

/** A tappable checkbox with its label; the whole row is the target. */
export function CheckRow({ isChecked, onToggle, label, hint }: CheckRowProps) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isChecked }}
      accessibilityLabel={label}
      style={styles.row}
    >
      <View style={[styles.checkbox, isChecked && styles.checkboxOn]}>
        {isChecked && <Icon name="check" size={14} color={colors.textOnDark} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.body}>{label}</Text>
        {hint ? <Text style={styles.caption}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}
