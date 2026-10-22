import React from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  AFTER_DAYS_PRESETS,
  FREQUENCY_OPTIONS,
  frequencyLabel,
  REMIND_PRESETS,
  WEEKDAY_CHOICES,
  asksStartMonth,
  clampAfterDays,
  clampRemind,
  previewDates,
  remindLabel,
  shortMonthHint,
  startChoices,
  startMonthChoices,
  toggleTwiceDay,
  type BillEditorForm,
} from "../../../lib/expenses/bill-editor-form";
import type { BillPayment } from "../../../lib/expenses/bill-schedule";
import { shortDate } from "../../../lib/expenses/bills-screen";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { Chip, ChipRow, DayGrid, Field, Stepper } from "./BillEditorParts";

interface ScheduleFieldsProps {
  form: BillEditorForm;
  today: string;
  isEditing: boolean;
  /** An edited bill's id and payments: LPG's preview counts from the last one. */
  billId?: string;
  payments: readonly BillPayment[];
  onChange: (next: BillEditorForm) => void;
}

/** "How often", in plain sentences, with the one detail each needs, and the next three dates live. */
export function ScheduleFields({ form, today, isEditing, billId, payments, onChange }: ScheduleFieldsProps) {
  const set = (patch: Partial<BillEditorForm>) => onChange({ ...form, ...patch });
  const preview = previewDates(form, today, payments, billId);
  const isMonthDay = form.frequency === "monthly" || form.frequency === "months_3" || form.frequency === "yearly";
  const isWeekly = form.frequency === "weekly" || form.frequency === "every_2_weeks";
  const startMonth = form.startsOn.slice(0, 7);

  return (
    <>
      <Field label="How often">
        <ChipRow>
          {FREQUENCY_OPTIONS.map((option) => (
            <Chip key={option.value} label={frequencyLabel(option, form)} isOn={form.frequency === option.value} onPress={() => set({ frequency: option.value })} />
          ))}
        </ChipRow>
      </Field>

      {isMonthDay ? (
        <Field label="On which day" hint={shortMonthHint(form)}>
          <DayGrid selected={[form.day]} prefix="Due on day" onPick={(day) => set({ day })} />
        </Field>
      ) : null}
      {form.frequency === "twice_monthly" ? (
        <Field label="On which two days" hint={shortMonthHint(form)}>
          <DayGrid selected={form.days} prefix="Due on day" onPick={(day) => set({ days: toggleTwiceDay(form.days, day) })} />
        </Field>
      ) : null}
      {isWeekly ? (
        <Field label="On which day of the week">
          <ChipRow>
            {WEEKDAY_CHOICES.map((choice) => (
              <Chip key={choice.value} label={choice.label} isOn={form.weekday === choice.value} onPress={() => set({ weekday: choice.value })} />
            ))}
          </ChipRow>
        </Field>
      ) : null}
      {form.frequency === "after_days" ? (
        <Field label="About how many days after the last one">
          <ChipRow>
            {AFTER_DAYS_PRESETS.map((days) => (
              <Chip key={days} label={`${days} days`} isOn={form.afterDays === days} onPress={() => set({ afterDays: days })} />
            ))}
          </ChipRow>
          <Stepper
            label="days between"
            value={`${form.afterDays} ${form.afterDays === 1 ? "day" : "days"}`}
            onMinus={() => set({ afterDays: clampAfterDays(form.afterDays - 1) })}
            onPlus={() => set({ afterDays: clampAfterDays(form.afterDays + 1) })}
          />
        </Field>
      ) : null}
      {asksStartMonth(form.frequency) && !isEditing ? (
        <Field label="First one in">
          <ChipRow>
            {startMonthChoices(today).map((choice) => (
              <Chip
                key={choice.key}
                label={choice.label}
                isOn={!form.isStartAuto ? startMonth === choice.key : choice.startsOn === today}
                onPress={() => set({ startsOn: choice.startsOn, isStartAuto: false })}
              />
            ))}
          </ChipRow>
        </Field>
      ) : null}
      {!asksStartMonth(form.frequency) && form.frequency !== "after_days" && !isEditing ? (
        <Field label="Count from" hint="Pick an earlier day if one is already due and not paid.">
          <ChipRow>
            {startChoices(today).map((choice) => (
              <Chip
                key={choice.key}
                label={choice.label}
                isOn={form.isStartAuto ? choice.startsOn === today : form.startsOn === choice.startsOn}
                onPress={() => set({ startsOn: choice.startsOn, isStartAuto: choice.startsOn === today })}
              />
            ))}
          </ChipRow>
        </Field>
      ) : null}

      <View style={styles.preview} accessible accessibilityLabel={`Next due: ${preview.map((date) => shortDate(date, today)).join(", ")}`}>
        <Text style={styles.previewLabel}>Next three</Text>
        <Text style={styles.previewDates} testID="bill-next-dates">
          {preview.length > 0 ? preview.map((date) => shortDate(date, today)).join(" · ") : "None: check the dates"}
        </Text>
      </View>
    </>
  );
}

interface RemindFieldProps {
  value: number;
  onChange: (days: number) => void;
}

/** On the day, 1 day before, 3 days before, or a custom lead up to 14 days. */
export function RemindField({ value, onChange }: RemindFieldProps) {
  const isCustom = !REMIND_PRESETS.includes(value);
  return (
    <Field label="Remind me">
      <ChipRow>
        {REMIND_PRESETS.map((days) => (
          <Chip key={days} label={remindLabel(days)} isOn={value === days} onPress={() => onChange(days)} />
        ))}
        <Chip label="Other" isOn={isCustom} onPress={() => onChange(isCustom ? value : 7)} />
      </ChipRow>
      {isCustom ? (
        <Stepper
          label="days before"
          value={remindLabel(value)}
          onMinus={() => onChange(clampRemind(value - 1))}
          onPlus={() => onChange(clampRemind(value + 1))}
        />
      ) : null}
    </Field>
  );
}

const styles = StyleSheet.create({
  preview: {
    gap: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
  },
  previewLabel: { ...typography.small, fontWeight: "700", color: colors.textMuted },
  previewDates: { ...typography.body, fontWeight: "600", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
});
