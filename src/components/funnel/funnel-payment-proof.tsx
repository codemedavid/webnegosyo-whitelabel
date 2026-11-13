'use client'

import { useEffect, useRef, useState } from 'react'
import { ImageUp, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { submitPaymentProof } from '@/app/actions/checkout-leads'
import { isImageKitConfigured, uploadPaymentProofImage } from '@/lib/imagekit-upload'
import { trackMetaEvent } from '@/lib/meta-pixel'
import { PAYMENT } from './funnel-payment-copy'

const PROOF_TYPES = ['image/png', 'image/jpg', 'image/jpeg', 'image/webp']
const PROOF_ACCEPT = PROOF_TYPES.join(',')
const MAX_PROOF_BYTES = 5 * 1024 * 1024

/** Why a picked file can't be sent, or null when it can. */
function proofFileProblem(file: File): string | null {
  if (!PROOF_TYPES.includes(file.type)) return PAYMENT.proofWrongType
  if (file.size > MAX_PROOF_BYTES) return PAYMENT.proofTooLarge
  if (!isImageKitConfigured()) return PAYMENT.proofUnavailable
  return null
}

function usePaymentProofUpload(referenceNumber: string, onUploaded: (url: string) => void, amount?: number) {
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  async function upload(file: File) {
    const problem = proofFileProblem(file)
    if (problem) {
      toast.error(problem)
      return
    }
    setIsUploading(true)
    setProgress(0)
    try {
      const { url } = await uploadPaymentProofImage(file, { purpose: 'platform-signup', onProgress: setProgress })
      const result = await submitPaymentProof(referenceNumber, url)
      if (result.error) {
        console.error('[funnel] payment proof refused', result.error)
        toast.error(PAYMENT.proofSaveFailed)
        return
      }
      // The buyer says they paid: the step between Lead and staff's Purchase.
      trackMetaEvent('AddPaymentInfo', { content_name: 'Smart Menu System', currency: 'PHP', value: amount })
      onUploaded(url)
    } catch (error) {
      console.error('[funnel] payment proof upload failed', error)
      toast.error(PAYMENT.proofUploadFailed)
    } finally {
      setIsUploading(false)
      setProgress(0)
    }
  }

  return { isUploading, progress, upload }
}

function ProofInput({ onPick, isDisabled }: { onPick: (file: File) => void; isDisabled: boolean }) {
  return (
    <input
      type="file"
      accept={PROOF_ACCEPT}
      aria-label={PAYMENT.proofInputLabel}
      disabled={isDisabled}
      className="sr-only"
      onChange={(event) => {
        const file = event.target.files?.[0]
        // Cleared so picking the same file again still fires a change.
        event.target.value = ''
        if (file) onPick(file)
      }}
    />
  )
}

/**
 * The screenshot upload: one big drop target. A saved screenshot is handed to
 * `onUploaded` (the payment step then shows the thank-you screen). `onKeep` is
 * set while the buyer is replacing an earlier screenshot, to go back without
 * sending a new one.
 */
export function FunnelPaymentProof({
  referenceNumber,
  amount,
  onUploaded,
  onKeep,
}: {
  referenceNumber: string
  amount?: number
  onUploaded: (url: string) => void
  onKeep?: () => void
}) {
  const { isUploading, progress, upload } = usePaymentProofUpload(referenceNumber, onUploaded, amount)
  const sectionRef = useRef<HTMLElement>(null)
  const isReplacing = Boolean(onKeep)

  // Arriving from the thank-you screen's "Palitan": bring the upload box into
  // view, it sits below the QR and account details.
  useEffect(() => {
    if (isReplacing) sectionRef.current?.scrollIntoView?.({ block: 'center' })
  }, [isReplacing])

  return (
    <section ref={sectionRef} className="fn-card p-6 sm:p-8" aria-labelledby="funnel-pay-proof">
      <h2 id="funnel-pay-proof" className="text-[18px] font-semibold tracking-[-0.01em] text-white">
        {PAYMENT.proofTitle}
      </h2>
      <p className="mt-1 text-[14px] text-[#A99C8D]">{isReplacing ? PAYMENT.proofReplacing : PAYMENT.proofBody}</p>

      <label className="fn-drop mt-5" data-busy={isUploading || undefined}>
        {isUploading ? (
          <>
            <Loader2 aria-hidden className="h-7 w-7 animate-spin text-[#F5A623]" />
            <span className="mt-3 text-[14px] font-medium text-white">{PAYMENT.proofUploading(progress)}</span>
            <span className="mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
              <span className="block h-full rounded-full bg-[#F5A623] transition-[width] duration-300" style={{ width: `${progress}%` }} />
            </span>
          </>
        ) : (
          <>
            <span className="fn-tile !h-14 !w-14"><ImageUp aria-hidden className="h-6 w-6" strokeWidth={1.75} /></span>
            <span className="mt-4 text-[15px] font-semibold text-white">{PAYMENT.proofPick}</span>
            <span className="mt-1 text-[12.5px] text-[#A99C8D]">{PAYMENT.proofTypes}</span>
          </>
        )}
        <ProofInput onPick={upload} isDisabled={isUploading} />
      </label>

      {onKeep && (
        <button type="button" onClick={onKeep} disabled={isUploading} className="fn-ghost-btn mt-4">
          {PAYMENT.proofKeep}
        </button>
      )}
    </section>
  )
}
