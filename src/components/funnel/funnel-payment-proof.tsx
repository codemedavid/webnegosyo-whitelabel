'use client'

import { useState } from 'react'
import { CheckCircle2, ImageUp, Loader2 } from 'lucide-react'
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

function usePaymentProofUpload(referenceNumber: string, initialUrl: string | null, amount?: number) {
  const [proofUrl, setProofUrl] = useState(initialUrl ?? '')
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
      setProofUrl(url)
      // The buyer says they paid: the step between Lead and staff's Purchase.
      trackMetaEvent('AddPaymentInfo', { content_name: 'Smart Menu System', currency: 'PHP', value: amount })
    } catch (error) {
      console.error('[funnel] payment proof upload failed', error)
      toast.error(PAYMENT.proofUploadFailed)
    } finally {
      setIsUploading(false)
      setProgress(0)
    }
  }

  return { proofUrl, isUploading, progress, upload }
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

/** The screenshot upload: a big drop target, then a "received" state with the image. */
export function FunnelPaymentProof({
  referenceNumber,
  initialProofUrl,
  amount,
}: {
  referenceNumber: string
  initialProofUrl: string | null
  amount?: number
}) {
  const { proofUrl, isUploading, progress, upload } = usePaymentProofUpload(referenceNumber, initialProofUrl, amount)

  return (
    <section className="fn-card p-6 sm:p-8" aria-labelledby="funnel-pay-proof">
      <h2 id="funnel-pay-proof" className="text-[18px] font-semibold tracking-[-0.01em] text-white">
        {PAYMENT.proofTitle}
      </h2>
      <p className="mt-1 text-[14px] text-[#A99C8D]">{PAYMENT.proofBody}</p>

      {proofUrl ? (
        <div className="mt-5 space-y-4">
          <div className="flex gap-3 rounded-2xl border border-[#3CC47C]/35 bg-[#3CC47C]/[0.08] p-4" role="status">
            <CheckCircle2 aria-hidden className="h-5 w-5 shrink-0 text-[#3CC47C]" />
            <div>
              <p className="text-[14.5px] font-semibold text-white">{PAYMENT.proofDone}</p>
              <p className="mt-0.5 text-[13px] text-[#A99C8D]">{PAYMENT.proofDoneBody}</p>
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- the buyer's own upload */}
          <img src={proofUrl} alt="" className="max-h-64 rounded-xl border border-white/10 object-contain" />
          <label className="fn-ghost-btn cursor-pointer">
            <ImageUp aria-hidden className="h-4 w-4" />
            {PAYMENT.proofReplace}
            <ProofInput onPick={upload} isDisabled={isUploading} />
          </label>
        </div>
      ) : (
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
      )}
    </section>
  )
}
