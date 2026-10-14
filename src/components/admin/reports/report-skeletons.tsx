import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const PULSE = 'bg-wn-canvas motion-reduce:animate-none'

function Loading({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      <div aria-hidden>{children}</div>
    </div>
  )
}

/** Matches a row of KpiTiles: 2 across on a phone, `count` across from 1024px. */
export function KpiRowSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <Loading label="Loading figures" className={className}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="flex flex-col gap-2 rounded-2xl bg-white p-4 ring-1 ring-border sm:p-5">
            <Skeleton className={cn(PULSE, 'h-3.5 w-20')} />
            <Skeleton className={cn(PULSE, 'h-8 w-28')} />
            <Skeleton className={cn(PULSE, 'h-4 w-14 rounded-full')} />
          </div>
        ))}
      </div>
    </Loading>
  )
}

/** Matches a ReportSection holding a TrendChart. */
export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <Loading label="Loading chart" className={className}>
      <div className="rounded-2xl bg-white p-4 ring-1 ring-border sm:p-5">
        <div className="flex items-center justify-between">
          <Skeleton className={cn(PULSE, 'h-4 w-32')} />
          <Skeleton className={cn(PULSE, 'h-8 w-28')} />
        </div>
        <Skeleton className={cn(PULSE, 'mt-4 h-56 w-full rounded-xl sm:h-64')} />
      </div>
    </Loading>
  )
}

/** Matches a ReportSection holding a ReportTable. */
export function TableSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <Loading label="Loading table" className={className}>
      <div className="rounded-2xl bg-white p-4 ring-1 ring-border sm:p-5">
        <Skeleton className={cn(PULSE, 'h-4 w-40')} />
        <div className="mt-4 flex flex-col gap-3">
          {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="flex items-center gap-4">
              <Skeleton className={cn(PULSE, 'h-4 flex-1')} />
              <Skeleton className={cn(PULSE, 'h-4 w-16')} />
              <Skeleton className={cn(PULSE, 'hidden h-4 w-20 sm:block')} />
            </div>
          ))}
        </div>
      </div>
    </Loading>
  )
}
