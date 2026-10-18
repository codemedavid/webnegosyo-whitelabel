'use client'

/**
 * Payment proof field — screenshot upload (ImageKit) and/or reference number.
 *
 * Colours come from the checkout theme's `--co-*` variables, which the
 * PaymentDetailsDialog sets on its root (see checkout-templates/checkout-theme).
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
import { PAYMENT_PROOF_MAX_FILE_SIZE } from '@/lib/payment-proof'
import { uploadPaymentProofImage, isImageKitConfigured } from '@/lib/imagekit-upload'
import { getContrastColor } from '@/lib/branding-utils'

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
  /** Text on the accent (the "Attached" chip). Defaults to a contrast colour. */
  accentText?: string
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
  accentText,
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
      // Through the server: it picks the folder and name and checks the bytes.
      const result = await uploadPaymentProofImage(file)
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
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: accent, color: accentText ?? getContrastColor(accent) }}
    >
      <Check className="h-3 w-3" /> Attached
    </span>
  ) : required ? (
    <span className="rounded-full bg-[var(--co-warning-soft)] px-2.5 py-1 text-xs font-medium text-[color:var(--co-text)]">Required</span>
  ) : (
    <span className="rounded-full bg-[var(--co-subtle-strong)] px-2.5 py-1 text-xs font-medium text-[color:var(--co-muted)]">Optional</span>
  )

  return (
    <section
      className="space-y-4 rounded-2xl border border-[color:var(--co-border)] bg-[var(--co-card)] p-4"
      aria-label="Proof of payment"
    >
      <div className="flex items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--co-text)]">
          <Receipt className="h-4 w-4 text-[color:var(--co-muted)]" />
          Proof of payment
        </h4>
        {statusChip}
      </div>

      {/* Screenshot upload. The file input is nested in the visible label and
          stretched over the tap target — iOS Safari ignores programmatic
          .click() on a display:none/sr-only input, and an unlabeled sr-only
          input would stay in the a11y tree after upload. */}
      {screenshotUrl ? (
        <div className="flex items-center gap-3 rounded-xl border border-[color:var(--co-border)] bg-[var(--co-subtle)] p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={screenshotUrl}
            alt="Payment screenshot"
            className="h-16 w-16 shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[color:var(--co-text)]">Screenshot attached</p>
            <p className="text-xs text-[color:var(--co-muted)]">We&apos;ll send it with your order.</p>
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove screenshot"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--co-muted)] transition-colors hover:bg-[var(--co-subtle-strong)] hover:text-[color:var(--co-text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : configured ? (
        <label
          className={cn(
            'relative flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[color:var(--co-border)] px-4 py-5 text-center transition-colors hover:border-[color:var(--co-accent-border)] hover:bg-[var(--co-subtle)]',
            'has-[:focus-visible]:border-[color:var(--co-accent)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[color:var(--co-accent-border)]',
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
            <Loader2 className="h-6 w-6 animate-spin text-[color:var(--co-muted)]" />
          ) : (
            <ImagePlus className="h-6 w-6 text-[color:var(--co-muted)]" />
          )}
          <span className="text-sm font-medium text-[color:var(--co-text)]">
            {isUploading ? 'Uploading...' : 'Upload screenshot'}
          </span>
          <span className="text-xs text-[color:var(--co-muted)]">PNG, JPG or WEBP · up to 5MB</span>
        </label>
      ) : (
        <p className="text-xs text-[color:var(--co-muted)]">Screenshot upload is not configured.</p>
      )}

      <div className="flex items-center gap-3 text-xs text-[color:var(--co-muted)]" aria-hidden="true">
        <span className="h-px flex-1 bg-[var(--co-border)]" />
        or
        <span className="h-px flex-1 bg-[var(--co-border)]" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="payment-proof-reference" className="text-sm text-[color:var(--co-text)]">
          Reference / transaction number
        </Label>
        <Input
          id="payment-proof-reference"
          value={reference}
          onChange={(e) => onReferenceChange(e.target.value)}
          placeholder="e.g. 0091234567890"
          maxLength={120}
          autoComplete="off"
          className="h-11 border-[color:var(--co-border)] bg-[var(--co-card)] text-base tabular-nums text-[color:var(--co-text)] placeholder:text-[color:var(--co-muted)] focus-visible:border-[color:var(--co-accent)] focus-visible:ring-[color:var(--co-accent-border)]"
        />
      </div>
    </section>
  )
}
