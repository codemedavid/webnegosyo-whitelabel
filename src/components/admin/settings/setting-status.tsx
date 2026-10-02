import { cn } from '@/lib/utils'
import type { SettingStatus, SettingStatusTone } from '@/lib/settings/settings-catalog'

const TONE_TEXT: Record<SettingStatusTone, string> = {
  ok: 'text-emerald-700 dark:text-emerald-400',
  attention: 'rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-800 dark:text-amber-300',
  neutral: 'text-muted-foreground',
  off: 'text-muted-foreground',
}

const TONE_DOT: Record<SettingStatusTone, string | null> = {
  ok: 'bg-emerald-500',
  attention: 'bg-amber-500',
  neutral: null,
  off: 'border border-muted-foreground/60',
}

interface SettingStatusLabelProps {
  status: SettingStatus
  className?: string
}

/** The one-line state beside a setting: a dot for on/off/needs-attention, then the words. */
export function SettingStatusLabel({ status, className }: SettingStatusLabelProps) {
  const dot = TONE_DOT[status.tone]
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5 text-[13px] font-medium leading-5',
        TONE_TEXT[status.tone],
        className
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot)} aria-hidden />}
      <span className="truncate">{status.label}</span>
    </span>
  )
}
