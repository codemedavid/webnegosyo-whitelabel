'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { paymentBrandFor, parsePaymentDetails } from '@/lib/checkout-leads/payment-brand'
import type { CheckoutLeadConfirmation } from '@/lib/checkout-leads/confirmation'
import { PAYMENT } from './funnel-payment-copy'
import { CopyRow, PaymentLogo } from './funnel-payment-ui'

type PaymentMethod = NonNullable<CheckoutLeadConfirmation['platform_payment_methods']>

function qrFileName(methodName: string): string {
  const slug = methodName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'payment'
  return `smartmenu-${slug}-qr.png`
}

/**
 * Most buyers are on the phone they pay with, so they cannot scan their own
 * screen: they save the QR and upload it in GCash. On a phone the share sheet
 * offers "Save Image" (to Photos, where GCash looks); elsewhere it downloads.
 */
async function saveQrImage(url: string, methodName: string): Promise<void> {
  const response = await fetch(url, { mode: 'cors' })
  if (!response.ok) throw new Error(`QR fetch failed: ${response.status}`)
  const blob = await response.blob()
  const file = new File([blob], qrFileName(methodName), { type: blob.type || 'image/png' })

  const isTouch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  if (isTouch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (error) {
      // The buyer closed the share sheet: nothing to fall back to.
      if (error instanceof DOMException && error.name === 'AbortError') return
      throw error
    }
  }

  const objectUrl = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = file.name
  link.click()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

function SaveQrButton({ url, methodName }: { url: string; methodName: string }) {
  const [isSaving, setIsSaving] = useState(false)

  async function handleSave() {
    setIsSaving(true)
    try {
      await saveQrImage(url, methodName)
    } catch (error) {
      console.error('[funnel] saving the QR failed', error)
      toast.error(PAYMENT.saveQrFailed)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <button type="button" onClick={handleSave} disabled={isSaving} className="fn-ghost-btn">
      {isSaving ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Download aria-hidden className="h-4 w-4" strokeWidth={2} />}
      {PAYMENT.saveQr}
    </button>
  )
}

function QrPlate({ method }: { method: PaymentMethod & { qr_code_url: string } }) {
  return (
    <div className="flex flex-col items-center">
      <div className="fn-qr-plate">
        {/* eslint-disable-next-line @next/next/no-img-element -- staff-set URL on the media host; preloaded by the form */}
        <img
          src={method.qr_code_url}
          alt={PAYMENT.qrAlt(method.name)}
          width={260}
          height={260}
          className="h-[240px] w-[240px] object-contain sm:h-[260px] sm:w-[260px]"
        />
      </div>
      <p className="mt-3 max-w-[300px] text-center text-[13px] leading-relaxed text-[#A99C8D]">{PAYMENT.qrHint}</p>
      <div className="mt-3">
        <SaveQrButton url={method.qr_code_url} methodName={method.name} />
      </div>
      <p className="mt-2 max-w-[300px] text-center text-[12.5px] leading-relaxed text-[#A99C8D] sm:hidden">{PAYMENT.qrPhoneHint}</p>
    </div>
  )
}

function HowToPay({ hasQr }: { hasQr: boolean }) {
  return (
    <div className="border-t border-white/10 pt-5">
      <h3 className="text-[14px] font-semibold text-white">{PAYMENT.howTitle}</h3>
      <ol className="mt-3 space-y-2.5">
        {PAYMENT.howSteps(hasQr).map((step, index) => (
          <li key={step} className="flex gap-3 text-[14px] leading-snug text-[#EFE6D8]">
            <span aria-hidden className="fn-step-num">{index + 1}</span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Where to send the money: logo, QR on a white plate, copyable name + number. */
export function FunnelPaymentMethod({ method }: { method: PaymentMethod | null }) {
  if (!method) {
    return (
      <section className="fn-card p-6 sm:p-8">
        <p className="text-[15px] text-[#EFE6D8]">{PAYMENT.noMethod}</p>
      </section>
    )
  }

  const brand = paymentBrandFor(method.name)
  const details = parsePaymentDetails(method.details)
  const numberLabel = brand?.numberLabel ?? PAYMENT.accountNumber
  const methodName = brand?.displayName ?? method.name
  const qrUrl = method.qr_code_url

  return (
    <section className="fn-card space-y-6 p-6 sm:p-8" aria-labelledby="funnel-pay-method">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="fn-worth">{PAYMENT.sendTo}</p>
          <h2 id="funnel-pay-method" className="mt-1 text-[20px] font-semibold tracking-[-0.01em] text-white">
            {methodName}
          </h2>
        </div>
        <PaymentLogo name={method.name} size="card" />
      </div>

      {qrUrl && <QrPlate method={{ ...method, name: methodName, qr_code_url: qrUrl }} />}

      {details && (
        <dl className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-black/25 px-4">
          {details.accountName && <CopyRow label={PAYMENT.accountName} value={details.accountName} />}
          {details.accountNumber && (
            <CopyRow label={numberLabel} value={details.accountNumber} copyValue={details.accountNumber} copyLabel={numberLabel} />
          )}
          {details.extraLines.map((line) => (
            <div key={line} className="py-3 text-[14px] text-[#EFE6D8]">
              <dd>{line}</dd>
            </div>
          ))}
        </dl>
      )}

      <HowToPay hasQr={Boolean(qrUrl)} />
    </section>
  )
}
