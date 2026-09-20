import { initialsOf } from '@/lib/staff-activity/staff-format'

/**
 * A person, before you have read their name.
 *
 * Colour is derived from the account id, not picked, so Ana is the same green
 * on the directory, on her profile and in a year's time. Six hues only: the
 * point is to tell two cards apart at a glance, not to encode anything.
 */
const HUES = [
  'bg-emerald-100 text-emerald-700 ring-emerald-200',
  'bg-sky-100 text-sky-700 ring-sky-200',
  'bg-violet-100 text-violet-700 ring-violet-200',
  'bg-amber-100 text-amber-700 ring-amber-200',
  'bg-rose-100 text-rose-700 ring-rose-200',
  'bg-teal-100 text-teal-700 ring-teal-200',
] as const

const SIZES = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-16 w-16 text-xl',
} as const

function hueFor(seed: string): string {
  let sum = 0
  for (let index = 0; index < seed.length; index += 1) sum += seed.charCodeAt(index)
  return HUES[sum % HUES.length]
}

export function StaffAvatar({
  name,
  seed,
  size = 'md',
}: {
  name: string
  /** Stable id behind the colour. Falls back to the name. */
  seed?: string
  size?: keyof typeof SIZES
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-1 ${hueFor(seed || name)} ${SIZES[size]}`}
    >
      {initialsOf(name)}
    </span>
  )
}
