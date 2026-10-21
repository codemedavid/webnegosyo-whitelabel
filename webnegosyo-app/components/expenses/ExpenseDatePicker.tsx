import React, { useState } from "react";
import { Platform, ScrollView, StyleSheet, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";

import { dateToDay, dayToDate, oldestSpendDate } from "../../lib/expenses/add-expense-form";
import { dayLabel } from "../../lib/expenses/expense-format";
import { addDays } from "../../lib/expenses/manila-date";
import { colors, spacing } from "../../theme/colors";
import { Button } from "../Button";
import { BackRow, Chip } from "./AddExpenseParts";

/** iOS draws the calendar inline, so it takes the sheet's body; Android's is the system dialog. */
export const IS_DATE_PICKER_INLINE = Platform.OS === "ios";

interface ExpenseDatePickerProps {
  /** `YYYY-MM-DD` now chosen. */
  value: string;
  /** Manila today: the latest day allowed. */
  today: string;
  onPick: (day: string) => void;
  onClose: () => void;
}

/**
 * When the money went out. Bounded by the same limit the form checks
 * (`oldestSpendDate`), so the calendar never offers a day Save would refuse.
 */
export function ExpenseDatePicker({ value, today, onPick, onClose }: ExpenseDatePickerProps) {
  const minimumDate = dayToDate(oldestSpendDate(today));
  const maximumDate = dayToDate(today);

  if (!IS_DATE_PICKER_INLINE) {
    const onAndroidPick = (event: DateTimePickerEvent, picked?: Date) => {
      // Close first: a dismissed dialog must still let the next tap reopen it.
      onClose();
      if (event.type === "set" && picked) onPick(dateToDay(picked));
    };
    return (
      <DateTimePicker
        mode="date"
        value={dayToDate(value)}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        onChange={onAndroidPick}
      />
    );
  }
  return <InlineCalendar value={value} today={today} minimumDate={minimumDate} maximumDate={maximumDate} onPick={onPick} onClose={onClose} />;
}

function InlineCalendar({
  value,
  today,
  minimumDate,
  maximumDate,
  onPick,
  onClose,
}: ExpenseDatePickerProps & { minimumDate: Date; maximumDate: Date }) {
  const [draft, setDraft] = useState(value);
  const quick = [today, addDays(today, -1)];
  const choose = (day: string) => {
    onPick(day);
    onClose();
  };
  return (
    <View style={styles.panel}>
      <BackRow label="Which day?" onBack={onClose} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.quick}>
          {quick.map((day) => (
            <Chip key={day} label={dayLabel(day)} isOn={day === draft} onPress={() => choose(day)} />
          ))}
        </View>
        <DateTimePicker
          mode="date"
          display="inline"
          value={dayToDate(draft)}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={(_event, picked) => picked && setDraft(dateToDay(picked))}
          themeVariant="light"
          accentColor={colors.accent}
        />
        <Button label={`Use ${dayLabel(draft)}`} onPress={() => choose(draft)} size="lg" testID="expense-date-done" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1 },
  body: { gap: spacing.md, paddingBottom: spacing.lg },
  quick: { flexDirection: "row", gap: spacing.sm },
});
