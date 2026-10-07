'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { CheckCircle2, Circle, ExternalLink, Loader2, Rocket } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { requestStoreLaunchAction } from '@/app/actions/store-launch'
import type { LaunchReadiness } from '@/lib/onboarding/readiness'
import type { LaunchBuildSummary } from '@/lib/onboarding/summary'

export interface LaunchChecklistProps {
  tenantId: string
  tenantSlug: string
  readiness: LaunchReadiness
  summary: LaunchBuildSummary | null
  isLive: boolean
  isLaunchRequested: boolean
  isPaymentConfirmed: boolean
}

function statusLine(props: Pick<LaunchChecklistProps, 'isLive' | 'isLaunchRequested' | 'isPaymentConfirmed'>): string {
  if (props.isLive) return 'Your store is live and taking orders.'
  if (props.isLaunchRequested) return 'Launch requested. Your store opens the moment we confirm your payment.'
  if (props.isPaymentConfirmed) return 'Payment confirmed. Review the checklist, then launch whenever you are ready.'
  return 'Your store is private while we confirm your payment. Review everything, then press Launch — it opens as soon as payment is confirmed.'
}

function WhatWeBuilt({ summary }: { summary: LaunchBuildSummary }) {
  const lines = [
    summary.menu && `${summary.menu.items} menu items in ${summary.menu.categories} categories`,
    summary.bestSellerNames.length > 0 && `Featured best sellers: ${summary.bestSellerNames.join(', ')}`,
    ...summary.offers.map((offer) => `Offer: ${offer.title}`),
    summary.loyalty && `Stamp card: ${summary.loyalty.threshold} orders → ${summary.loyalty.rewardLabel}`,
    summary.paymentMethods.length > 0 && `Payments: ${summary.paymentMethods.join(', ')}`,
  ].filter((line): line is string => typeof line === 'string')
  if (lines.length === 0) return null
  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="font-semibold">What we set up for you</h2>
      <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">{lines.map((line) => <li key={line}>• {line}</li>)}</ul>
      {summary.warnings.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {summary.warnings.map((warning) => <li key={warning}>⚠️ {warning}</li>)}
        </ul>
      )}
    </section>
  )
}

export function LaunchChecklist(props: LaunchChecklistProps) {
  const { tenantId, tenantSlug, readiness, summary } = props
  const [isPending, startTransition] = useTransition()
  const [isRequested, setIsRequested] = useState(props.isLaunchRequested)
  const [isLive, setIsLive] = useState(props.isLive)

  function launch() {
    startTransition(async () => {
      const result = await requestStoreLaunchAction(tenantId, tenantSlug)
      if (!result.success) return void toast.error(result.error)
      setIsRequested(true)
      if (result.outcome === 'live') {
        setIsLive(true)
        toast.success('Your store is live! 🎉')
      } else {
        toast.success('Launch requested — we will open your store as soon as payment is confirmed.')
      }
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Launch checklist</h1>
        <p className="text-muted-foreground">{statusLine({ isLive, isLaunchRequested: isRequested, isPaymentConfirmed: props.isPaymentConfirmed })}</p>
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${readiness.score}%` }} />
          </div>
          <span className="text-sm font-semibold tabular-nums">{readiness.score}%</span>
        </div>
      </header>

      <section className="divide-y rounded-xl border bg-card">
        {readiness.items.map((item) => (
          <Link key={item.id} href={`/${tenantSlug}/admin${item.adminPath}`} className="flex items-start gap-3 p-4 transition-colors hover:bg-muted/50">
            {item.isDone
              ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-label="Done" />
              : <Circle className={`mt-0.5 h-5 w-5 shrink-0 ${item.isBlocker ? 'text-red-500' : 'text-muted-foreground'}`} aria-label="To do" />}
            <span className="min-w-0 flex-1">
              <span className="block font-medium">
                {item.label}
                {item.isBlocker && !item.isDone && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">Required</span>}
              </span>
              <span className="block text-sm text-muted-foreground">{item.hint}</span>
            </span>
          </Link>
        ))}
      </section>

      {summary && <WhatWeBuilt summary={summary} />}

      <div className="flex flex-col gap-3 sm:flex-row">
        {!isLive && (
          <Button size="lg" onClick={launch} disabled={isPending || isRequested || !readiness.canLaunch} className="sm:flex-1">
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
            {isRequested ? 'Launch requested' : 'Launch my store'}
          </Button>
        )}
        <Button size="lg" variant="outline" asChild className="sm:flex-1">
          <a href={`/${tenantSlug}/menu`} target="_blank" rel="noopener noreferrer">
            Preview store <ExternalLink className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </div>
    </div>
  )
}
