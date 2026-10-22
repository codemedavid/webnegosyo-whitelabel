/**
 * Bills to pay — phone reminders (contract docs/plans/expenses/bills-contract.md §3).
 * The owner's phone schedules these as local notifications at 08:00 Manila;
 * every reminder on the same morning bundles into one. Wording stays plain:
 * never "You missed".
 *
 * Pure; builds on `bill-schedule.ts`. Copied byte-for-byte into the merchant
 * app (`tests/unit/expenses/app-parity.test.ts`).
 */
import { OPEN_STATES, paymentsOwed, type Bill, type Occurrence } from './bill-schedule'
import { addDays, daysBetween } from './manila-date'

export const DEFAULT_REMINDER_HORIZON_DAYS = 14
/** Reminders fire at this Manila hour. */
export const REMINDER_HOUR_MANILA = 8

const LATE_REMINDER_OFFSETS = { late1: 1, late3: 3 } as const
const WEEK_DAYS = 7
const PESO_CENTS = 100

const pad2 = (value: number): string => String(value).padStart(2, '0')

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** "₱6,200", "₱1,250.50". */
function pesoText(cents: number): string {
  const rounded = Math.max(0, Math.round(cents))
  const centavos = rounded % PESO_CENTS
  const whole = groupThousands(String((rounded - centavos) / PESO_CENTS))
  return centavos === 0 ? `₱${whole}` : `₱${whole}.${pad2(centavos)}`
}

export type BillReminderKind = 'before' | 'due' | 'late1' | 'late3'

export interface BillReminder {
  /** One notification per day: `bill-reminder-<fireOn>`. */
  id: string
  fireOn: string
  /** `fireOn` at 08:00 Manila, as an ISO instant with offset. */
  fireAt: string
  kind: BillReminderKind
  billIds: string[]
  title: string
  body: string
}

interface PlannedReminder {
  kind: BillReminderKind
  fireOn: string
  occurrence: Occurrence
  name: string
}

const KIND_URGENCY: Readonly<Record<BillReminderKind, number>> = Object.freeze({ before: 0, due: 1, late1: 2, late3: 3 })

function kindOn(dueOn: string, fireOn: string): BillReminderKind {
  const after = daysBetween(dueOn, fireOn)
  if (after < 0) return 'before'
  if (after === 0) return 'due'
  return after < LATE_REMINDER_OFFSETS.late3 ? 'late1' : 'late3'
}

function plannedFor(bill: Bill, occurrence: Occurrence): Omit<PlannedReminder, 'occurrence' | 'name'>[] {
  const { dueOn } = occurrence
  const lead = bill.remindDaysBefore
  const planned = [
    lead > 0 ? { kind: 'before' as const, fireOn: addDays(dueOn, -lead) } : { kind: 'due' as const, fireOn: dueOn },
    { kind: 'late1' as const, fireOn: addDays(dueOn, LATE_REMINDER_OFFSETS.late1) },
    { kind: 'late3' as const, fireOn: addDays(dueOn, LATE_REMINDER_OFFSETS.late3) },
  ]
  const until = occurrence.state === 'snoozed' ? occurrence.snoozedUntil : null
  if (until === null) return planned
  return [{ kind: kindOn(dueOn, until), fireOn: until }, ...planned.filter((reminder) => reminder.fireOn > until)]
}

const owedCents = (occurrence: Occurrence): number | null =>
  occurrence.amountCents === null ? null : occurrence.amountCents * paymentsOwed(occurrence)

function amountWords(occurrences: readonly Occurrence[]): string | null {
  const known = occurrences.map(owedCents).filter((cents): cents is number => cents !== null)
  if (known.length === 0) return null
  const isRough = known.length < occurrences.length || occurrences.some((row) => row.isEstimate)
  const text = pesoText(known.reduce((sum, cents) => sum + cents, 0))
  return isRough ? `about ${text}` : text
}

function dueWords(name: string, dueOn: string, fireOn: string): string {
  const ahead = daysBetween(fireOn, dueOn)
  if (ahead > 1) return `${name} is due in ${ahead} days`
  if (ahead === 1) return `${name} is due tomorrow`
  if (ahead === 0) return `${name} is due today`
  return ahead === -1 ? `${name} was due yesterday` : `${name} was due ${-ahead} days ago`
}

function listWords(names: readonly string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function bundleWhen(group: readonly PlannedReminder[], fireOn: string): string {
  const ahead = group.map((reminder) => daysBetween(fireOn, reminder.occurrence.dueOn))
  if (ahead.every((days) => days === 0)) return 'due today'
  if (ahead.every((days) => days >= 0 && days < WEEK_DAYS)) return 'this week'
  return 'to pay'
}

function withAmount(text: string, amount: string | null): string {
  return amount ? `${text} · ${amount}` : text
}

function reminderOf(fireOn: string, group: readonly PlannedReminder[]): BillReminder {
  const kind = group.reduce<BillReminderKind>((most, r) => (KIND_URGENCY[r.kind] > KIND_URGENCY[most] ? r.kind : most), 'before')
  const amount = amountWords(group.map((reminder) => reminder.occurrence))
  const billIds = [...new Set(group.map((reminder) => reminder.occurrence.billId))]
  const base = { id: `bill-reminder-${fireOn}`, fireOn, fireAt: `${fireOn}T${pad2(REMINDER_HOUR_MANILA)}:00:00+08:00`, kind, billIds }
  if (group.length === 1) {
    const [{ occurrence, name }] = group
    const lateCount = occurrence.lateCount
    const body = lateCount > 1 ? `${lateCount} payments still open. Tap to see them.` : 'Tap to mark it paid.'
    return { ...base, title: withAmount(dueWords(name, occurrence.dueOn, fireOn), amount), body }
  }
  const title = withAmount(`${group.length} bills ${bundleWhen(group, fireOn)}`, amount)
  return { ...base, title, body: `${listWords(group.map((reminder) => reminder.name))}. Tap to see them.` }
}

/**
 * Phone reminders at 08:00 Manila for the next `horizonDays`: `remindDaysBefore`
 * days ahead (or on the day when 0), the morning after the due date (late1) and
 * 3 days after (late3). A snoozed bill reminds again on its snooze date. Every
 * reminder on the same day bundles into one notification.
 */
export function reminderPlan(
  bills: readonly Bill[],
  occurrences: readonly Occurrence[],
  today: string,
  horizonDays: number = DEFAULT_REMINDER_HORIZON_DAYS,
): BillReminder[] {
  const billById = new Map(bills.filter((bill) => bill.status !== 'ended').map((bill) => [bill.id, bill]))
  const last = addDays(today, horizonDays)
  const byDay = new Map<string, PlannedReminder[]>()
  const ordered = [...occurrences].sort((a, b) => a.dueOn.localeCompare(b.dueOn))
  for (const occurrence of ordered) {
    const bill = billById.get(occurrence.billId)
    if (!bill || !OPEN_STATES.has(occurrence.state)) continue
    for (const planned of plannedFor(bill, occurrence)) {
      if (planned.fireOn < today || planned.fireOn > last) continue
      byDay.set(planned.fireOn, [...(byDay.get(planned.fireOn) ?? []), { ...planned, occurrence, name: bill.name }])
    }
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fireOn, group]) => reminderOf(fireOn, group))
}
