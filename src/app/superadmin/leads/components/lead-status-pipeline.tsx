import { Card, CardContent } from '@/components/ui/card'
import type { LeadStatus } from '@/lib/leads/types'

const PIPELINE_SEGMENTS: { status: LeadStatus; label: string; color: string; dot: string }[] = [
  { status: 'new', label: 'New', color: 'bg-blue-500', dot: 'bg-blue-500' },
  { status: 'contacted', label: 'Contacted', color: 'bg-amber-500', dot: 'bg-amber-500' },
  { status: 'qualified', label: 'Qualified', color: 'bg-purple-500', dot: 'bg-purple-500' },
  { status: 'converted', label: 'Converted', color: 'bg-green-500', dot: 'bg-green-500' },
  { status: 'lost', label: 'Lost', color: 'bg-zinc-300', dot: 'bg-zinc-300' },
]

interface LeadStatusPipelineProps {
  statusBreakdown: Record<LeadStatus, number>
}

export function LeadStatusPipeline({ statusBreakdown }: LeadStatusPipelineProps) {
  const total = Object.values(statusBreakdown).reduce((sum, n) => sum + n, 0)

  return (
    <Card>
      <CardContent className="pt-6">
        {/* Segmented bar */}
        {total > 0 ? (
          <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
            {PIPELINE_SEGMENTS.map((seg) => {
              const count = statusBreakdown[seg.status]
              if (count === 0) return null
              return (
                <div
                  key={seg.status}
                  className={seg.color}
                  style={{ flex: count }}
                />
              )
            })}
          </div>
        ) : (
          <div className="h-2 rounded-full bg-muted" />
        )}

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          {PIPELINE_SEGMENTS.map((seg) => (
            <div key={seg.status} className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${seg.dot}`} />
              <span className="text-sm text-muted-foreground">{seg.label}</span>
              <span className="text-sm font-semibold">{statusBreakdown[seg.status]}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
