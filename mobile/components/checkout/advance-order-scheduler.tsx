import React from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@/theme/provider'
import {
  type AdvanceOrderConfig,
  type ScheduleDateOption,
  type TimeSlotOption,
  formatLeadTime,
} from '@/lib/advance-order-utils'

export interface AdvanceOrderSchedulerProps {
  config: AdvanceOrderConfig
  scheduleMode: 'asap' | 'scheduled'
  onChangeMode: (mode: 'asap' | 'scheduled') => void
  scheduleDates: ScheduleDateOption[]
  timeSlots: TimeSlotOption[]
  scheduleDate: string
  scheduleTime: string
  onChangeDate: (date: string) => void
  onChangeTime: (time: string) => void
  scheduledForLabel: string | null
  /** Order type kind — drives the "Ready"/"Arriving" wording. */
  orderTypeKind?: 'dine_in' | 'pickup' | 'delivery'
}

/**
 * Themed "When would you like it?" advance-order scheduler.
 * Mirrors the web AdvanceOrderScheduler: ASAP vs Schedule toggle (ASAP hidden when
 * disabled), date chips (horizontal scroll), time pills (wrapping grid), a
 * "Ready/Arriving <label>" confirmation line, and a lead-time notice.
 */
export function AdvanceOrderScheduler({
  config,
  scheduleMode,
  onChangeMode,
  scheduleDates,
  timeSlots,
  scheduleDate,
  scheduleTime,
  onChangeDate,
  onChangeTime,
  scheduledForLabel,
  orderTypeKind,
}: AdvanceOrderSchedulerProps) {
  const { theme } = useTheme()

  if (!config.enabled) return null

  const accent = theme.checkoutModalButton
  const accentText = theme.checkoutModalButtonText
  const border = theme.checkoutModalBorder
  const titleColor = theme.checkoutModalTitle
  const descColor = theme.checkoutModalDescription
  const surface = theme.checkoutModalBackground

  const renderModeButton = (
    mode: 'asap' | 'scheduled',
    icon: keyof typeof Ionicons.glyphMap,
    title: string,
    subtitle: string,
  ) => {
    const active = scheduleMode === mode
    return (
      <Pressable
        key={mode}
        onPress={() => onChangeMode(mode)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={[
          styles.modeButton,
          {
            borderColor: active ? accent : border,
            backgroundColor: active ? accent + '14' : surface,
            flex: 1,
          },
        ]}
      >
        <View
          style={[
            styles.modeIcon,
            active
              ? { backgroundColor: accent }
              : { backgroundColor: border + '66' },
          ]}
        >
          <Ionicons name={icon} size={18} color={active ? accentText : descColor} />
        </View>
        <View style={styles.modeTextWrap}>
          <Text style={[styles.modeTitle, { color: titleColor }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.modeSubtitle, { color: descColor }]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </Pressable>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Ionicons name="time-outline" size={20} color={accent} />
        <Text style={[styles.heading, { color: titleColor }]}>When would you like it?</Text>
      </View>

      <View style={styles.modeRow}>
        {config.allowAsap
          ? renderModeButton('asap', 'flash-outline', 'As soon as possible', 'Prepare my order now')
          : null}
        {renderModeButton(
          'scheduled',
          'calendar-outline',
          'Schedule for later',
          config.allowAsap ? 'Pick a date & time' : 'Advance order required',
        )}
      </View>

      {scheduleMode === 'scheduled' ? (
        <View
          style={[
            styles.schedulePanel,
            { borderColor: accent + '40', backgroundColor: accent + '0a' },
          ]}
        >
          {/* Date chips */}
          <Text style={[styles.fieldLabel, { color: descColor }]}>Date</Text>
          {scheduleDates.length === 0 ? (
            <Text style={[styles.emptyText, { color: descColor }]}>
              No available dates right now.
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {scheduleDates.map((d) => {
                const active = d.value === scheduleDate
                return (
                  <Pressable
                    key={d.value}
                    onPress={() => onChangeDate(d.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.dateChip,
                      {
                        borderColor: active ? accent : border,
                        backgroundColor: active ? accent : surface,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dateChipText,
                        { color: active ? accentText : titleColor },
                      ]}
                    >
                      {d.label}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          )}

          {/* Time pills */}
          <Text style={[styles.fieldLabel, { color: descColor, marginTop: 14 }]}>Time</Text>
          {timeSlots.length === 0 ? (
            <Text style={[styles.emptyText, { color: descColor }]}>
              No more times available for this day — please pick another date.
            </Text>
          ) : (
            <View style={styles.pillGrid}>
              {timeSlots.map((s) => {
                const active = s.value === scheduleTime
                return (
                  <Pressable
                    key={s.value}
                    onPress={() => onChangeTime(s.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.timePill,
                      {
                        borderColor: active ? accent : border,
                        backgroundColor: active ? accent : surface,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.timePillText,
                        { color: active ? accentText : titleColor },
                      ]}
                    >
                      {s.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          )}

          {/* Confirmation line */}
          {timeSlots.length > 0 && scheduledForLabel ? (
            <View
              style={[
                styles.confirmRow,
                { borderColor: accent + '4d', backgroundColor: surface },
              ]}
            >
              <Ionicons name="calendar-outline" size={16} color={accent} />
              <Text style={[styles.confirmText, { color: descColor }]}>
                {orderTypeKind === 'delivery' ? 'Arriving' : 'Ready'}{' '}
                <Text style={[styles.confirmStrong, { color: titleColor }]}>
                  {scheduledForLabel}
                </Text>
              </Text>
            </View>
          ) : null}

          {/* Lead-time notice */}
          {config.leadTimeMinutes > 0 ? (
            <Text style={[styles.leadNotice, { color: descColor }]}>
              Orders need at least {formatLeadTime(config.leadTimeMinutes)} of advance notice.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, marginTop: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  heading: { fontSize: 17, fontWeight: '700' },
  modeRow: { flexDirection: 'row', gap: 10 },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 2,
    borderRadius: 12,
    padding: 12,
  },
  modeIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTextWrap: { flex: 1, minWidth: 0 },
  modeTitle: { fontSize: 13, fontWeight: '700' },
  modeSubtitle: { fontSize: 11, marginTop: 2 },
  schedulePanel: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  chipRow: { gap: 8, paddingRight: 4 },
  dateChip: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dateChipText: { fontSize: 13, fontWeight: '600' },
  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timePill: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  timePillText: { fontSize: 13, fontWeight: '600' },
  emptyText: { fontSize: 12 },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 14,
  },
  confirmText: { fontSize: 13, flex: 1 },
  confirmStrong: { fontWeight: '700' },
  leadNotice: { fontSize: 11, marginTop: 10 },
})
