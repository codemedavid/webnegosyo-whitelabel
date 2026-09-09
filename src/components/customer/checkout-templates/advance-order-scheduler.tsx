'use client'

/**
 * The checkout's "When would you like it?" picker (branded).
 *
 * Dates are cards in a snapping strip, times are grouped by part of the day,
 * and the choice is read back as one line. A pre-order cart locks the date
 * — only the time is left to pick. All decisions come from useCheckout();
 * this only presents them.
 */

import { CalendarClock, CalendarDays, Clock, Lock, Zap } from 'lucide-react'
import { setAlpha, getCheckoutPalette } from '@/lib/branding-utils'
import { describeScheduleDate, formatLeadTime, groupTimeSlotsByPeriod } from '@/lib/advance-order-utils'
import { formatPresellDateLabel } from '@/lib/presell/month-grid'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

const RADIO_BASE =
  'transition-[background-color,border-color,box-shadow,transform] duration-150 touch-manipulation active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1'

interface ModeChoiceProps {
  isActive: boolean
  icon: React.ReactNode
  title: string
  subtitle: string
  accent: string
  accentText: string
  accentSoft: string
  onSelect: () => void
}

function ModeChoice({ isActive, icon, title, subtitle, accent, accentText, accentSoft, onSelect }: ModeChoiceProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isActive}
      onClick={onSelect}
      className={`flex items-start gap-3 rounded-xl border-2 p-3.5 text-left ${RADIO_BASE}`}
      style={{ borderColor: isActive ? accent : '#e5e7eb', backgroundColor: isActive ? accentSoft : '#ffffff', ['--tw-ring-color' as string]: accent }}
    >
      <span
        className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={isActive ? { backgroundColor: accent, color: accentText } : { backgroundColor: '#f3f4f6', color: '#4b5563' }}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-gray-900">{title}</span>
        <span className="mt-0.5 block text-xs text-gray-500">{subtitle}</span>
      </span>
    </button>
  )
}

export function AdvanceOrderScheduler({ checkout }: { checkout: UseCheckoutReturn }) {
  const {
    advanceConfig, scheduleMode, setScheduleMode, scheduleDate, scheduleTime, setScheduleTime,
    scheduleDates, timeSlots, scheduledForLabel, selectedOrderTypeData, handleScheduleDateChange,
    cartPresellDate,
  } = checkout
  const { accent, accentText, accentSoft } = getCheckoutPalette(checkout.tenant, checkout.branding)

  if (!advanceConfig.enabled) return null

  const slotGroups = groupTimeSlotsByPeriod(timeSlots)
  const readyVerb = selectedOrderTypeData?.type === 'delivery' ? 'Arriving' : 'Ready'

  return (
    <div data-advance-order style={{ ['--checkout-accent' as string]: accent }}>
      <div className="mb-3 flex items-center gap-2">
        <Clock className="h-5 w-5" style={{ color: accent }} />
        <h3 className="text-base font-bold text-gray-900 sm:text-lg">When would you like it?</h3>
      </div>

      {cartPresellDate ? (
        <div className="flex items-center gap-3 rounded-xl border p-3.5" style={{ borderColor: setAlpha(accent, 0.3), backgroundColor: accentSoft }}>
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: accent, color: accentText }}>
            <CalendarDays className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-gray-500">Pickup date · set by your pre-order</p>
            <p className="text-base font-bold text-gray-900">{formatPresellDateLabel(cartPresellDate)}</p>
          </div>
          <Lock className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
        </div>
      ) : (
        <div role="radiogroup" aria-label="When" className={`grid gap-2.5 sm:gap-3 ${advanceConfig.allowAsap ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {advanceConfig.allowAsap && (
            <ModeChoice
              isActive={scheduleMode === 'asap'}
              icon={<Zap className="h-5 w-5" />}
              title="As soon as possible"
              subtitle="Prepare my order now"
              accent={accent} accentText={accentText} accentSoft={accentSoft}
              onSelect={() => setScheduleMode('asap')}
            />
          )}
          <ModeChoice
            isActive={scheduleMode === 'scheduled'}
            icon={<CalendarClock className="h-5 w-5" />}
            title="Schedule for later"
            subtitle={advanceConfig.allowAsap ? 'Pick a date & time' : 'Advance order required'}
            accent={accent} accentText={accentText} accentSoft={accentSoft}
            onSelect={() => setScheduleMode('scheduled')}
          />
        </div>
      )}

      {scheduleMode === 'scheduled' && (
        <div className="mt-4 space-y-4">
          {scheduleDates.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 p-4 text-center text-sm text-gray-600">
              No advance times are available right now — please check back later or contact us.
            </p>
          ) : (
            <>
              {!cartPresellDate && (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <CalendarDays className="h-3.5 w-3.5" /> Date
                  </p>
                  <div role="radiogroup" aria-label="Date" className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {scheduleDates.map((d) => {
                      const isSelected = d.value === scheduleDate
                      const card = describeScheduleDate(d)
                      return (
                        <button
                          key={d.value}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          aria-label={`${card.headline}, ${card.month} ${card.day}`}
                          onClick={() => handleScheduleDateChange(d.value)}
                          className={`flex w-[76px] shrink-0 snap-start flex-col items-center rounded-xl border py-2 ${RADIO_BASE}`}
                          style={isSelected
                            ? { backgroundColor: accent, color: accentText, borderColor: accent, boxShadow: `0 6px 16px -6px ${setAlpha(accent, 0.55)}`, ['--tw-ring-color' as string]: accent }
                            : { backgroundColor: '#ffffff', color: '#111827', borderColor: '#e5e7eb', ['--tw-ring-color' as string]: accent }}
                        >
                          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ opacity: isSelected ? 0.85 : 0.6 }}>{card.headline}</span>
                          <span className="text-2xl font-bold leading-tight tabular-nums">{card.day}</span>
                          <span className="text-[11px] font-medium" style={{ opacity: isSelected ? 0.85 : 0.6 }}>{card.month}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <Clock className="h-3.5 w-3.5" /> Time
                </p>
                {slotGroups.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-gray-300 p-3 text-sm text-gray-600">
                    No more times available for this day — please pick another date.
                  </p>
                ) : (
                  <div role="radiogroup" aria-label="Time" className="space-y-3">
                    {slotGroups.map((group) => (
                      <div key={group.key}>
                        <p className="mb-1.5 text-xs font-medium text-gray-500">{group.label}</p>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                          {group.slots.map((s) => {
                            const isSelected = s.value === scheduleTime
                            return (
                              <button
                                key={s.value}
                                type="button"
                                role="radio"
                                aria-checked={isSelected}
                                aria-label={s.label}
                                onClick={() => setScheduleTime(s.value)}
                                className={`rounded-lg border px-2 py-2.5 text-center text-sm font-semibold tabular-nums ${RADIO_BASE}`}
                                style={isSelected
                                  ? { backgroundColor: accent, color: accentText, borderColor: accent, ['--tw-ring-color' as string]: accent }
                                  : { backgroundColor: '#ffffff', color: '#374151', borderColor: '#e5e7eb', ['--tw-ring-color' as string]: accent }}
                              >
                                {s.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {timeSlots.length > 0 && scheduledForLabel && (
            <div className="flex items-center gap-3 rounded-xl border px-3.5 py-3" style={{ borderColor: setAlpha(accent, 0.3), backgroundColor: accentSoft }} aria-live="polite">
              <CalendarClock className="h-5 w-5 shrink-0" style={{ color: accent }} />
              <p className="text-sm text-gray-700">
                <span className="block text-xs font-medium text-gray-500">{readyVerb}</span>
                <span className="font-bold text-gray-900">{scheduledForLabel}</span>
              </p>
            </div>
          )}

          {advanceConfig.leadTimeMinutes > 0 && (
            <p className="text-[11px] text-gray-500">
              Orders need at least {formatLeadTime(advanceConfig.leadTimeMinutes)} of advance notice.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
