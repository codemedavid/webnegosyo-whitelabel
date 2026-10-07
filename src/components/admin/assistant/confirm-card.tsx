'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, Loader2, X } from 'lucide-react'
import type { ConfirmCard } from '@/lib/assistant/types'

type CardState =
  | { phase: 'idle' }
  | { phase: 'working' }
  | { phase: 'applied'; message: string; link: { label: string; path: string } | null }
  | { phase: 'closed'; message: string }

interface ConfirmCardViewProps {
  card: ConfirmCard
  tenantId: string
  adminBasePath: string
  onNavigate: () => void
}

const CLOSED_TEXT: Record<string, string> = {
  cancelled: 'Cancelled — nothing was changed.',
  expired: 'This proposal expired. Ask again for a fresh one.',
  applied: 'Done.',
  failed: 'This change could not be made.',
  executing: 'Being applied…',
}

/** The only path from a proposal to a real change: the owner's own tap. */
export function ConfirmCardView({ card, tenantId, adminBasePath, onNavigate }: ConfirmCardViewProps) {
  const settled = card.status && card.status !== 'pending' ? card.status : null
  const isExpired = Date.parse(card.expiresAt) <= Date.now()
  const [state, setState] = useState<CardState>(() => {
    if (settled) return { phase: 'closed', message: CLOSED_TEXT[settled] ?? 'This proposal was already handled.' }
    return isExpired ? { phase: 'closed', message: CLOSED_TEXT.expired } : { phase: 'idle' }
  })

  const decide = async (decision: 'confirm' | 'cancel') => {
    setState({ phase: 'working' })
    try {
      const response = await fetch(`/api/assistant/actions/${card.actionId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId, decision }),
      })
      const body = (await response.json().catch(() => ({}))) as { status?: string; message?: string; error?: string; link?: { label: string; path: string } | null }
      if (body.status === 'applied' && body.message) {
        setState({ phase: 'applied', message: body.message, link: body.link ?? null })
      } else {
        setState({ phase: 'closed', message: body.error ?? CLOSED_TEXT[body.status ?? ''] ?? 'Something went wrong. Nothing was changed.' })
      }
    } catch {
      setState({ phase: 'closed', message: 'Could not reach the server. Nothing was changed.' })
    }
  }

  return (
    <section className="rounded-2xl bg-white ring-1 ring-amber-300">
      <header className="px-4 pb-2 pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Needs your OK</p>
        <h3 className="text-[14px] font-extrabold tracking-[-0.01em]">{card.title}</h3>
      </header>
      <dl className="space-y-1 px-4 pb-3">
        {card.lines.map((line) => (
          <div key={line.label} className="flex gap-3 text-[13px]">
            <dt className="w-28 shrink-0 text-muted-foreground">{line.label}</dt>
            <dd className="min-w-0 flex-1 font-medium">{line.value}</dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-border px-4 py-3">
        {state.phase === 'idle' || state.phase === 'working' ? (
          <>
            {card.warning ? <p className="mb-2 text-[12px] text-muted-foreground">{card.warning}</p> : null}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={state.phase === 'working'}
                onClick={() => decide('confirm')}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {state.phase === 'working' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                Confirm
              </button>
              <button
                type="button"
                disabled={state.phase === 'working'}
                onClick={() => decide('cancel')}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-muted-foreground ring-1 ring-border hover:bg-muted disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Cancel
              </button>
            </div>
          </>
        ) : state.phase === 'applied' ? (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700">
              <Check className="h-4 w-4" aria-hidden />
              {state.message}
            </p>
            {state.link ? (
              <Link href={`${adminBasePath}${state.link.path}`} onClick={onNavigate} className="inline-flex items-center gap-1 text-xs font-semibold underline-offset-2 hover:underline">
                {state.link.label}
                <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            ) : null}
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">{state.message}</p>
        )}
      </div>
    </section>
  )
}
