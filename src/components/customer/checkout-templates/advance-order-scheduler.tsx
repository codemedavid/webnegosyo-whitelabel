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
import { cornersClass, type CornersChoice } from '@/lib/page-designer/knobs'
import { checkoutThemeStyle } from './checkout-theme'
import type { ScheduleMode } from '@/hooks/checkout/use-checkout-schedule'
import { ScheduleModeChoices } from './schedule-mode-choices'

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
  corners?: CornersChoice
  onSelect: () => void
}

function ModeChoice({ isActive, icon, title, subtitle, accent, accentText, accentSoft, corners, onSelect }: ModeChoiceProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isActive}
      onClick={onSelect}
      className={`flex items-start gap-3 ${cornersClass(corners, 'rounded-xl')} border-2 p-3.5 text-left ${RADIO_BASE}`}
      style={{ borderColor: isActive ? accent : 'var(--co-border)', backgroundColor: isActive ? accentSoft : 'var(--co-card)', ['--tw-ring-color' as string]: accent }}
    >
      <span
        className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={isActive ? { backgroundColor: accent, color: accentText } : { backgroundColor: 'var(--co-subtle-strong)', color: 'var(--co-muted)' }}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[color:var(--co-text)]">{title}</span>
        <span className="mt-0.5 block text-xs text-[color:var(--co-muted)]">{subtitle}</span>
      </span>
    </button>
  )
}

/** The scheduler's wording a Page Designer checkout may change. */
export interface SchedulerCopy {
  title: string
  asapTitle: string
  asapSubtitle: string
  laterTitle: string
  laterSubtitle: string
  /** "Later" details when the order must be scheduled (no ASAP choice). */
  laterRequired: string
}

const DEFAULT_COPY: SchedulerCopy = {
  title: 'When would you like it?',
  asapTitle: 'As soon as possible',
  asapSubtitle: 'Prepare my order now',
  laterTitle: 'Schedule for later',
  laterSubtitle: 'Pick a date & time',
  laterRequired: 'Advance order required',
}

/** Page Designer settings for the now/later choice; absent = the standard cards. */
export interface SchedulerLook {
  design: 'cards' | 'pill' | 'list'
  corners: CornersChoice
}

interface AdvanceOrderSchedulerProps {
  checkout: UseCheckoutReturn
  copy?: Partial<SchedulerCopy>
  look?: SchedulerLook
}

export function AdvanceOrderScheduler({ checkout, copy: copyOverrides, look }: AdvanceOrderSchedulerProps) {
  const {
    advanceConfig, scheduleMode, setScheduleMode, scheduleDate, scheduleTime, setScheduleTime,
    scheduleDates, timeSlots, scheduledForLabel, selectedOrderTypeData, handleScheduleDateChange,
    cartPresellDate,
  } = checkout
  const { accent, accentText, accentSoft } = getCheckoutPalette(checkout.tenant, checkout.branding)

  if (!advanceConfig.enabled) return null
  const copy: SchedulerCopy = { ...DEFAULT_COPY, ...copyOverrides }

  const slotGroups = groupTimeSlotsByPeriod(timeSlots)
  const readyVerb = selectedOrderTypeData?.type === 'delivery' ? 'Arriving' : 'Ready'

  return (
    <div data-advance-order style={checkoutThemeStyle(checkout)}>
      <div className="mb-3 flex items-center gap-2">
        <Clock className="h-5 w-5" style={{ color: accent }} />
        <h3 className="text-base font-bold text-[color:var(--co-text)] sm:text-lg">{copy.title}</h3>
      </div>

      {cartPresellDate ? (
        <div className="flex items-center gap-3 rounded-xl border p-3.5" style={{ borderColor: setAlpha(accent, 0.3), backgroundColor: accentSoft }}>
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: accent, color: accentText }}>
            <CalendarDays className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-[color:var(--co-muted)]">Pickup date · set by your pre-order</p>
            <p className="text-base font-bold text-[color:var(--co-text)]">{formatPresellDateLabel(cartPresellDate)}</p>
          </div>
          <Lock className="h-4 w-4 shrink-0 text-[color:var(--co-muted)]" aria-hidden="true" />
        </div>
      ) : look && look.design !== 'cards' ? (
        <ScheduleModeChoices
          design={look.design}
          corners={look.corners}
          items={[
            ...(advanceConfig.allowAsap ? [{ mode: 'asap' as ScheduleMode, title: copy.asapTitle, subtitle: copy.asapSubtitle }] : []),
            { mode: 'scheduled', title: copy.laterTitle, subtitle: advanceConfig.allowAsap ? copy.laterSubtitle : copy.laterRequired },
          ]}
          value={scheduleMode}
          onSelect={setScheduleMode}
        />
      ) : (
        <div role="radiogroup" aria-label="When" className={`grid gap-2.5 sm:gap-3 ${advanceConfig.allowAsap ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {advanceConfig.allowAsap && (
            <ModeChoice
              isActive={scheduleMode === 'asap'}
              icon={<Zap className="h-5 w-5" />}
              title={copy.asapTitle}
              subtitle={copy.asapSubtitle}
              accent={accent} accentText={accentText} accentSoft={accentSoft} corners={look?.corners}
              onSelect={() => setScheduleMode('asap')}
            />
          )}
          <ModeChoice
            isActive={scheduleMode === 'scheduled'}
            icon={<CalendarClock className="h-5 w-5" />}
            title={copy.laterTitle}
            subtitle={advanceConfig.allowAsap ? copy.laterSubtitle : copy.laterRequired}
            accent={accent} accentText={accentText} accentSoft={accentSoft} corners={look?.corners}
            onSelect={() => setScheduleMode('scheduled')}
          />
        </div>
      )}

      {scheduleMode === 'scheduled' && (
        <div className="mt-4 space-y-4">
          {scheduleDates.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[color:var(--co-border)] p-4 text-center text-sm text-[color:var(--co-muted)]">
              No advance times are available right now — please check back later or contact us.
            </p>
          ) : (
            <>
              {!cartPresellDate && (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--co-muted)]">
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
                            : { backgroundColor: 'var(--co-card)', color: 'var(--co-text)', borderColor: 'var(--co-border)', ['--tw-ring-color' as string]: accent }}
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
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--co-muted)]">
                  <Clock className="h-3.5 w-3.5" /> Time
                </p>
                {slotGroups.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-[color:var(--co-border)] p-3 text-sm text-[color:var(--co-muted)]">
                    No more times available for this day — please pick another date.
                  </p>
                ) : (
                  <div role="radiogroup" aria-label="Time" className="space-y-3">
                    {slotGroups.map((group) => (
                      <div key={group.key}>
                        <p className="mb-1.5 text-xs font-medium text-[color:var(--co-muted)]">{group.label}</p>
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
                                  : { backgroundColor: 'var(--co-card)', color: 'var(--co-text)', borderColor: 'var(--co-border)', ['--tw-ring-color' as string]: accent }}
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
              <p className="text-sm text-[color:var(--co-text)]">
                <span className="block text-xs font-medium text-[color:var(--co-muted)]">{readyVerb}</span>
                <span className="font-bold text-[color:var(--co-text)]">{scheduledForLabel}</span>
              </p>
            </div>
          )}

          {advanceConfig.leadTimeMinutes > 0 && (
            <p className="text-[11px] text-[color:var(--co-muted)]">
              Orders need at least {formatLeadTime(advanceConfig.leadTimeMinutes)} of advance notice.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
