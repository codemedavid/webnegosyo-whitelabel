import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ReceiptPaperProps {
  label: string
  children: ReactNode
  className?: string
}

/** A strip of thermal paper — how the lines will look on the printed receipt. */
export function ReceiptPaper({ label, children, className }: ReceiptPaperProps) {
  return (
    <figure className={cn('space-y-1.5', className)}>
      <figcaption className="text-xs font-medium text-muted-foreground">{label}</figcaption>
      <div className="mx-auto max-w-xs rounded-md border border-dashed bg-white px-4 py-3 text-center font-mono text-[12px] leading-relaxed text-neutral-900 shadow-xs dark:bg-neutral-50">
        {children}
      </div>
    </figure>
  )
}

interface PaperLineProps {
  children: ReactNode
  /** Shown greyed when the owner has not typed this line yet. */
  isPlaceholder?: boolean
  isBold?: boolean
}

export function PaperLine({ children, isPlaceholder = false, isBold = false }: PaperLineProps) {
  return (
    <p className={cn('break-words', isBold && 'font-bold', isPlaceholder && 'text-neutral-400')}>{children}</p>
  )
}
