'use client'

import { useEffect, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Check, Copy, Download, Loader2, QrCode, RotateCw, Share2 } from 'lucide-react'
import type { OnboardingView } from '@/lib/onboarding/view'
import { launchOnboardingStore, retryOnboarding } from './onboarding-api'
import { ACCENT, ACCENT_INK, FOCUS_RING, OB, PrimaryButton, SecondaryButton } from './onboarding-ui'

/*
 * The peak of the set-up: one message (you're open) and one action (share
 * your link). Everything else waits for the quick choices and Start here.
 */

const COPIED_RESET_MS = 2000
const QR_SIZE_PX = 640

export function useOrigin(): string {
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  return origin
}

function QrPanel({ storeUrl, storeName }: { storeUrl: string; storeName: string }) {
  const qrRef = useRef<HTMLDivElement>(null)
  const displayUrl = storeUrl.replace(/^https?:\/\//, '')

  function downloadQr() {
    const canvas = qrRef.current?.querySelector('canvas')
    if (!canvas) return
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = `${storeName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'store'}-qr.png`
    link.click()
  }

  return (
    <div className="flex items-center gap-5 rounded-2xl border-2 p-4 animate-in fade-in slide-in-from-top-1 duration-300" style={{ borderColor: OB.line }}>
      <div ref={qrRef} className="w-28 shrink-0 [&_canvas]:!h-auto [&_canvas]:!w-full">
        <QRCodeCanvas value={storeUrl} size={QR_SIZE_PX} marginSize={2} level="M" title={`QR code for ${displayUrl}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[15px] font-bold" style={{ color: OB.ink }}>Put it on your counter</p>
        <p className="mt-0.5 text-[13px] leading-relaxed" style={{ color: OB.muted }}>Customers scan it to order. Print it on a table tent or your packaging.</p>
        <button type="button" onClick={downloadQr}
          className={`mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-semibold underline decoration-1 underline-offset-4 ${FOCUS_RING}`}
          style={{ color: OB.ink }}>
          <Download className="h-4 w-4" aria-hidden /> Download PNG
        </button>
      </div>
    </div>
  )
}

export function ShareLink({ storeUrl, storeName }: { storeUrl: string; storeName: string }) {
  const [isCopied, setIsCopied] = useState(false)
  const [isQrOpen, setIsQrOpen] = useState(false)
  const displayUrl = storeUrl.replace(/^https?:\/\//, '')

  async function copy() {
    try {
      await navigator.clipboard.writeText(storeUrl)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), COPIED_RESET_MS)
    } catch {
      setIsCopied(false)
    }
  }

  async function share() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: storeName, text: `Order from ${storeName} online`, url: storeUrl })
        return
      } catch {
        // Cancelled or refused: fall through to Facebook.
      }
    }
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(storeUrl)}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-2xl border-2 border-dashed p-1.5 pl-4" style={{ borderColor: ACCENT }}>
        <span className="min-w-0 flex-1 truncate text-[15px] font-bold" style={{ color: OB.ink }}>{displayUrl}</span>
        <button type="button" onClick={copy}
          className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-4 text-sm font-bold transition-[filter] hover:brightness-110 ${FOCUS_RING}`}
          style={{ backgroundColor: ACCENT, color: ACCENT_INK }}>
          {isCopied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          <span aria-live="polite">{isCopied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <PrimaryButton onClick={share} isFull><Share2 className="h-4 w-4" aria-hidden /> Share my link</PrimaryButton>
      <SecondaryButton onClick={() => setIsQrOpen(!isQrOpen)} isFull><QrCode className="h-4 w-4" aria-hidden /> {isQrOpen ? 'Hide' : 'Show'} my counter QR</SecondaryButton>
      {isQrOpen && <QrPanel storeUrl={storeUrl} storeName={storeName} />}
    </div>
  )
}

interface OpenStoreProps {
  token: string
  view: OnboardingView
  onLaunched: () => void
}

/** Not live yet: name what blocks it, then one button. */
export function OpenStorePanel({ token, view, onLaunched }: OpenStoreProps) {
  const [isLaunching, setIsLaunching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const blockers = view.launch?.blockers ?? []
  const dashboardPath = view.store?.dashboardPath ?? '#'

  async function goLive() {
    setIsLaunching(true)
    setError(null)
    const result = await launchOnboardingStore(token)
    setIsLaunching(false)
    if (!result.ok) return setError(result.error)
    onLaunched()
  }

  if (!view.isPaymentConfirmed) {
    return <p className="text-[15px] leading-relaxed" style={{ color: OB.muted }}>Your store opens as soon as we confirm your payment. Look everything over in the meantime.</p>
  }

  return (
    <div className="space-y-4">
      {blockers.length > 0 && (
        <ul className="divide-y rounded-2xl border-2" style={{ borderColor: OB.line }}>
          {blockers.map((blocker) => (
            <li key={blocker} className="flex items-center gap-3 px-4 py-3.5" style={{ borderColor: OB.line }}>
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
              <span className="min-w-0 flex-1 text-[15px] font-semibold" style={{ color: OB.ink }}>{blocker}</span>
              <a href={dashboardPath} className={`-my-2 inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold underline decoration-1 underline-offset-4 ${FOCUS_RING}`} style={{ color: OB.ink }}>Fix</a>
            </li>
          ))}
        </ul>
      )}
      <PrimaryButton onClick={goLive} isDisabled={view.launch?.canLaunch !== true || isLaunching} isFull>
        {isLaunching && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {isLaunching ? 'Opening your store…' : 'Open my store'}
      </PrimaryButton>
      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
    </div>
  )
}

export function RetryFailedSteps({ token, view, onRetried }: { token: string; view: OnboardingView; onRetried: () => void }) {
  const [isRetrying, setIsRetrying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const failed = view.steps.filter((step) => step.status === 'failed')
  if (view.status !== 'failed' || failed.length === 0) return null

  async function retry() {
    setIsRetrying(true)
    const result = await retryOnboarding(token)
    setIsRetrying(false)
    if (!result.ok) return setError(result.error)
    onRetried()
  }

  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
      <p className="text-[15px] font-bold text-amber-950">A few things did not finish</p>
      <ul className="mt-1 space-y-0.5 text-sm text-amber-950">{failed.map((step) => <li key={step.id}>{step.detail ?? step.label}</li>)}</ul>
      <button type="button" onClick={retry} disabled={isRetrying}
        className={`mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-950 px-4 text-sm font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}>
        {isRetrying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCw className="h-4 w-4" aria-hidden />} Try again
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  )
}
