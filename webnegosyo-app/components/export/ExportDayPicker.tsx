import React, { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";

import { dateToDay, dayToDate } from "../../lib/expenses/add-expense-form";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Modal } from "../Modal";

interface ExportDayPickerProps {
  title: string;
  /** `YYYY-MM-DD` now chosen. */
  value: string;
  /** Store-local today: the latest day a file can cover. */
  today: string;
  onPick: (day: string) => void;
  onClose: () => void;
}

/** One day of a custom range. Android shows the system dialog; iOS a calendar in a sheet. */
export function ExportDayPicker({ title, value, today, onPick, onClose }: ExportDayPickerProps) {
  const [draft, setDraft] = useState(value);
  if (Platform.OS !== "ios") {
    const onAndroidPick = (event: DateTimePickerEvent, picked?: Date) => {
      // Close first: a dismissed dialog must still let the next tap reopen it.
      onClose();
      if (event.type === "set" && picked) onPick(dateToDay(picked));
    };
    return <DateTimePicker mode="date" value={dayToDate(value)} maximumDate={dayToDate(today)} onChange={onAndroidPick} />;
  }
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <DateTimePicker
            mode="date"
            display="inline"
            value={dayToDate(draft)}
            maximumDate={dayToDate(today)}
            onChange={(_event, picked) => picked && setDraft(dateToDay(picked))}
            themeVariant="light"
            accentColor={colors.accent}
            style={styles.calendar}
          />
          <Button
            label="Use this day"
            size="lg"
            onPress={() => {
              onPick(draft);
              onClose();
            }}
            testID="export-day-done"
          />
          <Button label="Cancel" tone="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(29,24,21,0.45)" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  title: { ...typography.heading, color: colors.textPrimary },
  // iOS draws the inline calendar at its own width; stretch it across the sheet.
  calendar: { alignSelf: "stretch" },
});
