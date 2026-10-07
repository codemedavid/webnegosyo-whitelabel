import { Flame } from 'lucide-react'
import type { HourRow } from '@/lib/dashboard/overview'
import { DashCard } from './dash-card'
import { PeakHoursChart } from './peak-hours-chart'

interface BusiestHoursCardProps {
  hours: HourRow[]
  busiestHour: HourRow | null
  className?: string
}

/** When the rush happens, so the owner can staff for it. */
export function BusiestHoursCard({ hours, busiestHour, className }: BusiestHoursCardProps) {
  return (
    <DashCard
      title="Busiest hours"
      icon={Flame}
      className={className}
      aside={
        busiestHour && (
          <span className="rounded-full bg-wn-coral-wash px-2.5 py-1 text-[12px] font-bold text-wn-coral-deep">
            Rush at {busiestHour.label}
          </span>
        )
      }
    >
      <PeakHoursChart hours={hours} busiestHour={busiestHour?.hour ?? null} />
    </DashCard>
  )
}
