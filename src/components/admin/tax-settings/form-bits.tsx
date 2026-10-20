'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface TaxCardProps {
  id: string
  icon: LucideIcon
  title: string
  description: ReactNode
  children: ReactNode
}

/** One numbered topic of the form, in the admin's usual card. */
export function TaxCard({ id, icon: Icon, title, description, children }: TaxCardProps) {
  const headingId = `${id}-heading`
  return (
    <Card id={id} aria-labelledby={headingId} role="region" className="scroll-mt-24">
      <CardHeader>
        <CardTitle id={headingId} className="flex items-center gap-2 text-lg">
          <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  )
}

interface FieldProps {
  id: string
  label: string
  hint?: ReactNode
  error?: string
  optional?: boolean
  children: ReactNode
  className?: string
}

/** Label, control, then one line of help — or the error in its place. */
export function Field({ id, label, hint, error, optional = false, children, className }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="font-medium">
        {label}
        {optional && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

/** The id an input should name in `aria-describedby` for its Field's text. */
export function describedById(id: string, error: string | undefined): string {
  return error ? `${id}-error` : `${id}-hint`
}

interface NoteProps {
  icon: LucideIcon
  tone?: 'info' | 'caution'
  children: ReactNode
}

export function Note({ icon: Icon, tone = 'info', children }: NoteProps) {
  return (
    <div
      className={cn(
        'flex gap-2.5 rounded-lg px-3 py-2.5 text-sm',
        tone === 'caution'
          ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
          : 'bg-muted/60 text-muted-foreground'
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  )
}
