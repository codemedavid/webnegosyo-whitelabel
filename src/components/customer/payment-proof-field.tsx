'use client'

/**
 * Payment proof field — screenshot upload (ImageKit) and/or reference number.
 *
 * Rendered inside the shared PaymentDetailsDialog so all checkout templates get
 * it. When the selected payment method requires proof, the customer must provide
 * at least one of: a screenshot or a reference number (enforced in useCheckout
 * before the order is submitted).
 */

import { useRef, useState } from 'react'
import { Check, ImagePlus, Loader2, Receipt, X } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  PAYMENT_PROOF_FOLDER,
  PAYMENT_PROOF_MAX_FILE_SIZE,
} from '@/lib/payment-proof'
import { uploadImageToImageKit, isImageKitConfigured } from '@/lib/imagekit-upload'

interface PaymentProofFieldProps {
  required: boolean
  screenshotUrl: string
  reference: string
  /** Called with the uploaded screenshot URL and its ImageKit file id. */
  onUploaded: (url: string, fileId: string) => void
  onRemove: () => void
  onReferenceChange: (value: string) => void
  /** Brand accent for the attached state and focus rings. */
  accent?: string
}

const VALID_TYPES = ['image/png', 'image/jpg', 'image/jpeg', 'image/webp']
const DEFAULT_ACCENT = '#111827'

export function PaymentProofField({
  required,
  screenshotUrl,
  reference,
  onUploaded,
  onRemove,
  onReferenceChange,
  accent = DEFAULT_ACCENT,
}: PaymentProofFieldProps) {
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const configured = isImageKitConfigured()
  const isSatisfied = Boolean(screenshotUrl) || reference.trim().length > 0

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!VALID_TYPES.includes(file.type)) {
      toast.error('Please upload a PNG, JPG, or WEBP image.')
      return
    }
    if (file.size > PAYMENT_PROOF_MAX_FILE_SIZE) {
      toast.error('Screenshot is too large (max 5MB).')
      return
    }

    setIsUploading(true)
    try {
      const result = await uploadImageToImageKit(file, { folder: PAYMENT_PROOF_FOLDER })
      onUploaded(result.url, result.fileId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload screenshot.')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const statusChip = isSatisfied ? (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-white"
      style={{ backgroundColor: accent }}
    >
      <Check className="h-3 w-3" /> Attached
    </span>
  ) : required ? (
    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">Required</span>
  ) : (
    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">Optional</span>
  )

  return (
    <section
      className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4"
      style={{ ['--checkout-accent' as string]: accent }}
      aria-label="Proof of payment"
    >
      <div className="flex items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Receipt className="h-4 w-4 text-gray-500" />
          Proof of payment
        </h4>
        {statusChip}
      </div>

      {/* Screenshot upload. The file input is nested in the visible label and
          stretched over the tap target — iOS Safari ignores programmatic
          .click() on a display:none/sr-only input, and an unlabeled sr-only
          input would stay in the a11y tree after upload. */}
      {screenshotUrl ? (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={screenshotUrl}
            alt="Payment screenshot"
            className="h-16 w-16 shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900">Screenshot attached</p>
            <p className="text-xs text-gray-500">We&apos;ll send it with your order.</p>
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove screenshot"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : configured ? (
        <label
          className={cn(
            'relative flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-300 px-4 py-5 text-center transition-colors hover:border-gray-400 hover:bg-gray-50',
            'has-[:focus-visible]:border-[color:var(--checkout-accent)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[color:var(--checkout-accent)]/30',
            isUploading && 'pointer-events-none opacity-60',
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpg,image/jpeg,image/webp"
            onChange={handleFileSelect}
            disabled={isUploading}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          {isUploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
          ) : (
            <ImagePlus className="h-6 w-6 text-gray-500" />
          )}
          <span className="text-sm font-medium text-gray-900">
            {isUploading ? 'Uploading...' : 'Upload screenshot'}
          </span>
          <span className="text-xs text-gray-500">PNG, JPG or WEBP · up to 5MB</span>
        </label>
      ) : (
        <p className="text-xs text-gray-500">Screenshot upload is not configured.</p>
      )}

      <div className="flex items-center gap-3 text-xs text-gray-400" aria-hidden="true">
        <span className="h-px flex-1 bg-gray-200" />
        or
        <span className="h-px flex-1 bg-gray-200" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="payment-proof-reference" className="text-sm text-gray-700">
          Reference / transaction number
        </Label>
        <Input
          id="payment-proof-reference"
          value={reference}
          onChange={(e) => onReferenceChange(e.target.value)}
          placeholder="e.g. 0091234567890"
          maxLength={120}
          autoComplete="off"
          className="h-11 bg-white text-base tabular-nums focus-visible:border-[color:var(--checkout-accent)] focus-visible:ring-[color:var(--checkout-accent)]/30"
        />
      </div>
    </section>
  )
}
