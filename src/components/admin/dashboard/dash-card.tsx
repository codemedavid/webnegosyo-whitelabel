import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DashCardProps {
  title: string
  icon: LucideIcon
  /** Right side of the header: a total, a link. */
  aside?: ReactNode
  className?: string
  children: ReactNode
}

/** The dashboard's one card shape: a small icon, a short title, the content. */
export function DashCard({ title, icon: Icon, aside, className, children }: DashCardProps) {
  return (
    <section className={cn('flex flex-col rounded-2xl bg-white ring-1 ring-border', className)}>
      <header className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
        <h2 className="flex items-center gap-2 text-[15px] font-extrabold tracking-[-0.01em]">
          <Icon className="h-[18px] w-[18px] text-muted-foreground" aria-hidden />
          {title}
        </h2>
        {aside}
      </header>
      <div className="flex-1 px-5 pb-5">{children}</div>
    </section>
  )
}
