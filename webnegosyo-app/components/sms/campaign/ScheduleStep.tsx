import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { CampaignDraft, CampaignFieldError } from "../../../lib/sms/campaign-form";
import {
  INTERVAL_PRESETS,
  SEND_TIME_PRESETS,
  WEEKDAY_SHORT,
  describeDate,
  describeSchedule,
  formatTime12h,
  switchScheduleKind,
} from "../../../lib/sms/campaign-wizard";
import type { ScheduleKind } from "../../../lib/sms/types";
import { Icon, type IconName } from "../../Icon";
import { ChoiceCard } from "./ChoiceCard";
import { StepIntro } from "./StepIntro";
import { colors, radius, spacing, typography } from "../../../theme/colors";

/** Which of the four date/time fields a native picker is editing. */
export type PickerField = "date" | "time" | "quietStart" | "quietEnd";

const KINDS: { kind: ScheduleKind; title: string; description: string; icon: IconName }[] = [
  { kind: "one_off", title: "Once", description: "On one day you pick", icon: "calendar" },
  {
    kind: "every_n_days",
    title: "Every few days",
    description: "Keeps going until you pause it",
    icon: "rotate",
  },
  { kind: "weekly", title: "Every week", description: "Same days each week", icon: "clock" },
];

const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

interface ScheduleStepProps {
  draft: CampaignDraft;
  errors: CampaignFieldError;
  /** Manila "YYYY-MM-DD". */
  today: string;
  tomorrow: string;
  onPatch: (changes: Partial<CampaignDraft>) => void;
  onOpenPicker: (field: PickerField) => void;
}

/**
 * Step four: when.
 *
 * Says out loud how sending works — the phone reminds, the merchant taps Send
 * — because "auto-send doesn't work" was reported about a feature that never
 * had auto-send (a deliberate choice: OEM battery managers kill background
 * senders). The answer is a sentence at the bottom, not a setting.
 */
export function ScheduleStep({
  draft,
  errors,
  today,
  tomorrow,
  onPatch,
  onOpenPicker,
}: ScheduleStepProps) {
  const [isQuietOpen, setQuietOpen] = useState(false);
  const isPresetTime = SEND_TIME_PRESETS.some((preset) => preset.time === draft.scheduleTime);
  const isOtherDate =
    draft.scheduleDate !== null && draft.scheduleDate !== today && draft.scheduleDate !== tomorrow;

  const toggleWeekday = (iso: number) =>
    onPatch({
      scheduleWeekdays: draft.scheduleWeekdays.includes(iso)
        ? draft.scheduleWeekdays.filter((day) => day !== iso)
        : [...draft.scheduleWeekdays, iso].sort((a, b) => a - b),
    });

  return (
    <View style={styles.wrap}>
      <StepIntro title="When should it go out?" hint="Pick how often, then a time of day." />

      <View style={styles.list} accessibilityRole="radiogroup">
        {KINDS.map(({ kind, title, description, icon }) => (
          <ChoiceCard
            key={kind}
            title={title}
            description={description}
            icon={icon}
            isSelected={draft.scheduleKind === kind}
            onPress={() => onPatch(switchScheduleKind(draft, kind, today))}
          >
            {kind === "one_off" && (
              <View style={styles.pills}>
                <Pill
                  label="Today"
                  isActive={draft.scheduleDate === today}
                  onPress={() => onPatch({ scheduleDate: today })}
                />
                <Pill
                  label="Tomorrow"
                  isActive={draft.scheduleDate === tomorrow}
                  onPress={() => onPatch({ scheduleDate: tomorrow })}
                />
                <Pill
                  label={isOtherDate && draft.scheduleDate ? describeDate(draft.scheduleDate, today) : "Pick a date"}
                  icon="calendar"
                  isActive={isOtherDate}
                  onPress={() => onOpenPicker("date")}
                />
              </View>
            )}
            {kind === "every_n_days" && (
              <View style={styles.pills}>
                {INTERVAL_PRESETS.map((days) => (
                  <Pill
                    key={days}
                    label={`${days} days`}
                    isActive={draft.scheduleIntervalDays === days}
                    onPress={() => onPatch({ scheduleIntervalDays: days })}
                  />
                ))}
                <IntervalStepper
                  value={draft.scheduleIntervalDays ?? 14}
                  onChange={(days) => onPatch({ scheduleIntervalDays: days })}
                />
              </View>
            )}
            {kind === "weekly" && (
              <View style={styles.weekdays}>
                {ISO_WEEKDAYS.map((iso) => {
                  const isOn = draft.scheduleWeekdays.includes(iso);
                  return (
                    <TouchableOpacity
                      key={iso}
                      style={[styles.weekday, isOn && styles.weekdayOn]}
                      onPress={() => toggleWeekday(iso)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isOn }}
                      accessibilityLabel={WEEKDAY_SHORT[iso]}
                    >
                      <Text style={[styles.weekdayText, isOn && styles.weekdayTextOn]}>
                        {WEEKDAY_SHORT[iso].slice(0, 2)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ChoiceCard>
        ))}
      </View>
      {(errors.scheduleDate || errors.scheduleIntervalDays || errors.scheduleWeekdays) && (
        <Text style={styles.error}>
          {errors.scheduleDate ?? errors.scheduleIntervalDays ?? errors.scheduleWeekdays}
        </Text>
      )}

      <View style={styles.group}>
        <Text style={styles.groupTitle}>What time?</Text>
        <View style={styles.pills}>
          {SEND_TIME_PRESETS.map((preset) => (
            <Pill
              key={preset.time}
              label={formatTime12h(preset.time)}
              caption={preset.label}
              isActive={draft.scheduleTime === preset.time}
              onPress={() => onPatch({ scheduleTime: preset.time })}
            />
          ))}
          <Pill
            label={isPresetTime ? "Other" : formatTime12h(draft.scheduleTime)}
            caption={isPresetTime ? "Pick a time" : "Your time"}
            icon="clock"
            isActive={!isPresetTime}
            onPress={() => onOpenPicker("time")}
          />
        </View>
        {errors.scheduleTime ? <Text style={styles.error}>{errors.scheduleTime}</Text> : null}
      </View>

      <View style={styles.summary}>
        <Icon name="calendar" size={20} color={colors.heroInkText} />
        <View style={styles.summaryCopy}>
          <Text style={styles.summaryTitle}>{describeSchedule(draft, today)}</Text>
          <Text style={styles.summaryHint}>
            When it&apos;s time, this phone reminds you and you tap Send. Texts go out from this
            phone&apos;s SIM — nothing sends behind your back.
          </Text>
        </View>
      </View>

      <View style={styles.quiet}>
        <TouchableOpacity
          style={styles.quietHead}
          onPress={() => setQuietOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: isQuietOpen }}
        >
          <View style={styles.quietCopy}>
            <Text style={styles.quietTitle}>Quiet hours</Text>
            <Text style={styles.quietHint}>
              No scheduled texts from {formatTime12h(draft.quietHoursStart)} to{" "}
              {formatTime12h(draft.quietHoursEnd)}
            </Text>
          </View>
          <Icon
            name={isQuietOpen ? "chevron-down" : "chevron"}
            size={14}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
        {isQuietOpen && (
          <View style={styles.quietBody}>
            <View style={styles.quietRow}>
              <TimeField
                label="From"
                value={draft.quietHoursStart}
                onPress={() => onOpenPicker("quietStart")}
              />
              <TimeField
                label="Until"
                value={draft.quietHoursEnd}
                onPress={() => onOpenPicker("quietEnd")}
              />
            </View>
            <Text style={styles.quietHint}>
              A scheduled reminder that lands inside these hours waits until morning. Sending
              by hand is still your call — you&apos;ll be told, not stopped.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function Pill({
  label,
  caption,
  icon,
  isActive,
  onPress,
}: {
  label: string;
  caption?: string;
  icon?: IconName;
  isActive: boolean;
  onPress: () => void;
}) {
  const ink = isActive ? colors.textOnDark : colors.textPrimary;
  return (
    <TouchableOpacity
      style={[styles.pill, caption ? styles.pillTall : null, isActive && styles.pillActive]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="radio"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={caption ? `${label}, ${caption}` : label}
    >
      <View style={styles.pillLine}>
        {icon ? <Icon name={icon} size={13} color={ink} /> : null}
        <Text style={[styles.pillText, isActive && styles.pillTextActive]}>{label}</Text>
      </View>
      {caption ? (
        <Text style={[styles.pillCaption, isActive && styles.pillCaptionActive]}>{caption}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

function IntervalStepper({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  return (
    <View style={styles.intervalStepper}>
      <TouchableOpacity
        style={[styles.stepButton, value <= 1 && styles.stepButtonOff]}
        onPress={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        accessibilityRole="button"
        accessibilityLabel="One day less"
      >
        <Icon name="minus" size={13} color={colors.textPrimary} strokeWidth={2.25} />
      </TouchableOpacity>
      <Text style={styles.intervalValue}>{value}d</Text>
      <TouchableOpacity
        style={styles.stepButton}
        onPress={() => onChange(value + 1)}
        accessibilityRole="button"
        accessibilityLabel="One day more"
      >
        <Icon name="plus" size={13} color={colors.textPrimary} strokeWidth={2.25} />
      </TouchableOpacity>
    </View>
  );
}

function TimeField({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.timeField}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${formatTime12h(value)}`}
    >
      <Text style={styles.timeLabel}>{label}</Text>
      <View style={styles.timeValueRow}>
        <Text style={styles.timeValue}>{formatTime12h(value)}</Text>
        <Icon name="clock" size={15} color={colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  list: { gap: spacing.sm },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" },
  pill: {
    minHeight: 38,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
    alignItems: "center",
    justifyContent: "center",
  },
  pillTall: { borderRadius: radius.md, paddingVertical: spacing.sm, minWidth: 92 },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillLine: { flexDirection: "row", alignItems: "center", gap: 5 },
  pillText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  pillTextActive: { color: colors.textOnDark },
  pillCaption: { ...typography.small, color: colors.textSecondary, marginTop: 1 },
  pillCaptionActive: { color: colors.heroInkMuted },
  weekdays: { flexDirection: "row", justifyContent: "space-between", gap: 4 },
  weekday: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.separator,
    alignItems: "center",
    justifyContent: "center",
  },
  weekdayOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  weekdayText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  weekdayTextOn: { color: colors.textOnDark },
  intervalStepper: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  stepButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  stepButtonOff: { opacity: 0.4 },
  intervalValue: {
    ...typography.caption,
    fontWeight: "800",
    minWidth: 34,
    textAlign: "center",
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  group: { gap: spacing.sm },
  groupTitle: { ...typography.heading, color: colors.textPrimary },
  summary: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.heroInk,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  summaryCopy: { flex: 1, gap: 4 },
  summaryTitle: { ...typography.body, fontWeight: "800", color: colors.heroInkText },
  summaryHint: { ...typography.caption, color: colors.heroInkMuted, lineHeight: 18 },
  quiet: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  quietHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  quietCopy: { flex: 1, gap: 2 },
  quietTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  quietHint: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  quietBody: {
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    padding: spacing.lg,
    gap: spacing.md,
  },
  quietRow: { flexDirection: "row", gap: spacing.md },
  timeField: {
    flex: 1,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  timeLabel: { ...typography.small, color: colors.textSecondary, fontWeight: "600" },
  timeValueRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  timeValue: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  error: { ...typography.small, color: colors.danger, fontWeight: "600" },
});
