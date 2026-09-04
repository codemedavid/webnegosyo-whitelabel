import { Check, Circle, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Panel } from '@/components/superadmin/ui/primitives'

export type ReadinessState = 'done' | 'todo' | 'optional'

export interface ReadinessItem {
  label: string
  detail: string
  state: ReadinessState
}

interface Props {
  items: ReadinessItem[]
  isReady: boolean
  error: string | null
}

/**
 * The pre-flight list beside the preview: what still blocks publishing, what
 * is optional, and the validator's own words when something is wrong.
 */
export function ReadinessCard({ items, isReady, error }: Props) {
  return (
    <Panel padding="p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Ready to publish</p>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
            isReady ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/20 bg-amber-400/10 text-amber-300',
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', isReady ? 'bg-emerald-400' : 'bg-amber-400')} />
          {isReady ? 'Yes' : 'Not yet'}
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-2.5">
            <ReadinessIcon state={item.state} />
            <div className="min-w-0">
              <p className={cn('text-sm', item.state === 'todo' ? 'text-white' : 'text-white/80')}>{item.label}</p>
              <p className="text-xs text-white/45">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      {error && !isReady ? <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">{error}</p> : null}
    </Panel>
  )
}

function ReadinessIcon({ state }: { state: ReadinessState }) {
  if (state === 'done') {
    return (
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-black">
        <Check className="h-3 w-3" />
      </span>
    )
  }
  if (state === 'optional') {
    return (
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-white/20 text-white/40">
        <Minus className="h-2.5 w-2.5" />
      </span>
    )
  }
  return <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
}
