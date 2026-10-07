import { ArrowUpRight } from 'lucide-react'

const STORE_TIME_ZONE = 'Asia/Manila'
const NOON = 12
const EVENING = 18

const DATE_LINE = new Intl.DateTimeFormat('en-PH', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  timeZone: STORE_TIME_ZONE,
})
const HOUR = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: STORE_TIME_ZONE })

/** Greets by the store's clock, not the server's (Vercel runs in UTC). */
export function greetingFor(now: Date): string {
  const hour = Number(HOUR.format(now))
  if (hour < NOON) return 'Good morning'
  if (hour < EVENING) return 'Good afternoon'
  return 'Good evening'
}

interface DashboardHeaderProps {
  storeName: string
  storefrontHref: string
  now: Date
}

export function DashboardHeader({ storeName, storefrontHref, now }: DashboardHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{DATE_LINE.format(now)}</p>
        <h1 className="mt-1.5 text-[26px] font-extrabold leading-[1.1] text-foreground md:text-[30px]">
          {greetingFor(now)}, <span className="break-words">{storeName}</span>
        </h1>
      </div>
      <a
        href={storefrontHref}
        target="_blank"
        rel="noreferrer"
        className="hidden shrink-0 items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-bold text-foreground ring-1 ring-border outline-none transition-colors hover:ring-foreground focus-visible:ring-2 focus-visible:ring-ring/50 sm:inline-flex"
      >
        View storefront
        <ArrowUpRight className="h-4 w-4" aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </header>
  )
}
