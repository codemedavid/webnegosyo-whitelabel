import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/cart-utils'
import {
  formatShiftLength,
  judgeShift,
  shiftDurationMs,
  shiftTurnover,
  type ShiftVerdictKind,
} from '@/lib/staff-activity/shift-summary'
import type { StaffShiftRecord } from '@/lib/staff-activity/staff-activity-service'
import { formatClock, formatDayLabel } from '@/lib/staff-activity/staff-format'
import { branchLabel, type StaffOutlet } from '@/lib/outlets/branch-label'
import { toBusinessDayKey } from '@/lib/inventory/business-day'

/**
 * Every drawer this person held, and whether it balanced.
 *
 * The verdict is the column the owner reads first, so it is a badge and it is
 * last — the eye lands on it after the numbers that explain it. An uncounted
 * drawer says "Not counted" rather than showing ₱0: a missing count is a
 * different fact from a perfect one, and only one of them is anyone's fault.
 */

const VERDICT_STYLE: Record<ShiftVerdictKind, { label: string; className: string }> = {
  open: { label: 'Open now', className: 'border-transparent bg-emerald-100 text-emerald-700' },
  uncounted: { label: 'Not counted', className: 'border-transparent bg-muted text-muted-foreground' },
  balanced: { label: 'Balanced', className: 'border-transparent bg-emerald-50 text-emerald-700' },
  short: { label: 'Short', className: 'border-transparent bg-rose-100 text-rose-700' },
  over: { label: 'Over', className: 'border-transparent bg-amber-100 text-amber-700' },
}

function VerdictBadge({ shift }: { shift: StaffShiftRecord }) {
  const verdict = judgeShift(shift)
  const style = VERDICT_STYLE[verdict.kind]
  const amount = verdict.variance === null ? null : formatPrice(Math.abs(verdict.variance))

  return (
    <Badge className={`${style.className} hover:${style.className}`}>
      {style.label}
      {verdict.kind === 'short' || verdict.kind === 'over' ? ` ${amount}` : ''}
    </Badge>
  )
}

export interface StaffShiftHistoryProps {
  shifts: readonly StaffShiftRecord[]
  nowMs: number
  nowIso: string
  outlets: readonly StaffOutlet[]
}

export function StaffShiftHistory({ shifts, nowMs, nowIso, outlets }: StaffShiftHistoryProps) {
  if (shifts.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        No shifts in this period. Shifts appear here once they open the drawer on the register.
      </p>
    )
  }

  return (
    <ul className="space-y-2" data-testid="staff-shift-history">
      {shifts.map((shift) => {
        const turnover = shiftTurnover(shift)
        return (
          <li key={shift.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {formatDayLabel(toBusinessDayKey(shift.openedAt), nowIso)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatClock(shift.openedAt)} →{' '}
                  {shift.closedAt ? formatClock(shift.closedAt) : 'still open'}
                  {' · '}
                  {formatShiftLength(shiftDurationMs(shift, nowMs))}
                  {outlets.length > 0 ? ` · ${branchLabel(shift.outletId, outlets)}` : ''}
                </p>
              </div>
              <VerdictBadge shift={shift} />
            </div>

            <dl className="mt-3 grid grid-cols-3 gap-2 border-t pt-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Float</dt>
                <dd className="font-medium tabular-nums">{formatPrice(shift.openingFloat)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Cash turned in</dt>
                <dd className="font-medium tabular-nums">
                  {turnover === null ? '—' : formatPrice(turnover)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Counted</dt>
                <dd className="font-medium tabular-nums">
                  {shift.closingCount === null ? '—' : formatPrice(shift.closingCount)}
                </dd>
              </div>
            </dl>

            {shift.note && <p className="mt-2 text-xs italic text-muted-foreground">“{shift.note}”</p>}
          </li>
        )
      })}
    </ul>
  )
}
