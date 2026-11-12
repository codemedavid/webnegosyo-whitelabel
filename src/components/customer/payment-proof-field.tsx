'use client'

/**
 * Payment proof field — screenshot upload (ImageKit) and/or reference number.
 *
 * Colours come from the checkout theme's `--co-*` variables, which the payment
 * step sets on its root (see checkout-templates/checkout-theme).
 *
 * Rendered by the payment step ONLY for a method that requires proof; the
 * customer must provide at least one of: a screenshot or a reference number
 * (enforced in useCheckout before the order is submitted, and by the step's
 * disabled Send button).
 *
 * Five designs, chosen by the owner in Branding Studio → Payment step
 * (`payment_step_style.upload_design`). `classic` is the pre-2026-11-12 box.
 * Every design shares the same upload control: the file input is nested in
 * the visible label and stretched over the tap target — iOS Safari ignores a
 * programmatic .click() on a display:none/sr-only input, and an unlabeled
 * sr-only input would stay in the a11y tree after upload.
 */

import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Camera, Check, ImagePlus, Loader2, Paperclip, Receipt, X } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { PAYMENT_PROOF_MAX_FILE_SIZE } from '@/lib/payment-proof'
import { uploadPaymentProofImage, isImageKitConfigured } from '@/lib/imagekit-upload'
import { getContrastColor } from '@/lib/branding-utils'
import type { PaymentUploadDesign } from '@/lib/payment-step/style'
import { useStorefrontLabel } from '@/components/customer/storefront-labels-provider'

interface PaymentProofFieldProps {
  required: boolean
  screenshotUrl: string
  reference: string
  /** Called with the uploaded screenshot URL, its ImageKit file id and delete token. */
  onUploaded: (url: string, fileId: string, deleteToken?: string) => void
  onRemove: () => void
  onReferenceChange: (value: string) => void
  /** Brand accent for the attached state and focus rings. */
  accent?: string
  /** Text on the accent (the "Attached" chip). Defaults to a contrast colour. */
  accentText?: string
  /** The owner's upload design (default: the classic box). */
  design?: PaymentUploadDesign
  /** The owner's example receipt picture, shown behind "See an example". */
  sampleImage?: string | null
  /** Studio / Page Designer preview: picking a file uploads nothing. */
  isPreviewOnly?: boolean
}

const VALID_TYPES = ['image/png', 'image/jpg', 'image/jpeg', 'image/webp']
const ACCEPT = 'image/png,image/jpg,image/jpeg,image/webp'
const DEFAULT_ACCENT = '#111827'
const FILE_HINT = 'PNG, JPG or WEBP · up to 5MB'
const REFERENCE_INPUT_ID = 'payment-proof-reference'

const FOCUS_WITHIN = 'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[color:var(--co-accent-border)]'
const INPUT_COLORS =
  'border-[color:var(--co-border)] bg-[var(--co-card)] text-[color:var(--co-text)] placeholder:text-[color:var(--co-muted)] focus-visible:border-[color:var(--co-accent)] focus-visible:ring-[color:var(--co-accent-border)]'

interface Words {
  title: string
  upload: string
  reference: string
  example: string
}

interface Upload {
  isUploading: boolean
  configured: boolean
  /** The tap target that opens the photo picker: `children` inside a label over the input. */
  target: (className: string, children: ReactNode, style?: CSSProperties) => ReactNode
}

function useUpload(onUploaded: PaymentProofFieldProps['onUploaded'], isPreviewOnly: boolean): Upload {
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const configured = isImageKitConfigured()

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (isPreviewOnly) {
      // An owner trying the preview must not leave stray files in storage.
      toast.info('Preview only — customers upload their screenshot here.')
      e.target.value = ''
      return
    }

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
      onUploaded(result.url, result.fileId, result.deleteToken)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload screenshot.')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const target = (className: string, children: ReactNode, style?: CSSProperties) => (
    <label className={cn('relative cursor-pointer', className, isUploading && 'pointer-events-none opacity-60')} style={style}>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleFileSelect}
        disabled={isUploading}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      {children}
    </label>
  )

  return { isUploading, configured, target }
}

function NotConfigured() {
  return <p className="text-xs text-[color:var(--co-muted)]">Screenshot upload is not configured.</p>
}

function AttachedShot({ url, onRemove, compact = false }: { url: string; onRemove: () => void; compact?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[color:var(--co-border)] bg-[var(--co-subtle)] p-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Payment screenshot"
        className={cn('shrink-0 rounded-lg object-cover', compact ? 'h-10 w-10' : 'h-16 w-16')}
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
  )
}

function ReferenceField({
  label,
  value,
  onChange,
  size = 'regular',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  size?: 'regular' | 'large' | 'small'
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={REFERENCE_INPUT_ID} className="text-sm text-[color:var(--co-text)]">
        {label}
      </Label>
      <Input
        id={REFERENCE_INPUT_ID}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. 0091234567890"
        maxLength={120}
        autoComplete="off"
        className={cn(
          'tabular-nums',
          INPUT_COLORS,
          size === 'large' ? 'h-14 text-lg font-semibold tracking-wide' : size === 'small' ? 'h-10 text-base' : 'h-11 text-base',
        )}
      />
    </div>
  )
}

function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-[color:var(--co-muted)]" aria-hidden="true">
      <span className="h-px flex-1 bg-[var(--co-border)]" />
      or
      <span className="h-px flex-1 bg-[var(--co-border)]" />
    </div>
  )
}

/** The owner's example receipt, folded away until asked for. */
function ExampleReceipt({ image, label }: { image: string | null | undefined; label: string }) {
  if (!image) return null
  return (
    <details className="group rounded-xl bg-[var(--co-subtle)] px-3 py-2">
      <summary className="cursor-pointer select-none list-none text-sm font-medium text-[color:var(--co-accent)] [&::-webkit-details-marker]:hidden">
        {label}
      </summary>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="Example payment receipt" className="mx-auto mt-2 max-h-72 w-auto rounded-lg object-contain" />
    </details>
  )
}

export function PaymentProofField({
  required,
  screenshotUrl,
  reference,
  onUploaded,
  onRemove,
  onReferenceChange,
  accent = DEFAULT_ACCENT,
  accentText,
  design = 'classic',
  sampleImage = null,
  isPreviewOnly = false,
}: PaymentProofFieldProps) {
  const upload = useUpload(onUploaded, isPreviewOnly)
  const words: Words = {
    title: useStorefrontLabel('payment.proof_title', 'Proof of payment'),
    upload: useStorefrontLabel('payment.upload', 'Upload screenshot'),
    reference: useStorefrontLabel('payment.reference', 'Reference / transaction number'),
    example: useStorefrontLabel('payment.example', 'See an example'),
  }
  const isSatisfied = Boolean(screenshotUrl) || reference.trim().length > 0
  const onAccent = accentText ?? getContrastColor(accent)

  const statusChip = isSatisfied ? (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium" style={{ backgroundColor: accent, color: onAccent }}>
      <Check className="h-3 w-3" /> Attached
    </span>
  ) : required ? (
    <span className="rounded-full bg-[var(--co-warning-soft)] px-2.5 py-1 text-xs font-medium text-[color:var(--co-text)]">Required</span>
  ) : (
    <span className="rounded-full bg-[var(--co-subtle-strong)] px-2.5 py-1 text-xs font-medium text-[color:var(--co-muted)]">Optional</span>
  )

  const heading = (
    <div className="flex items-center justify-between gap-3">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--co-text)]">
        <Receipt className="h-4 w-4 text-[color:var(--co-muted)]" />
        {words.title}
      </h4>
      {statusChip}
    </div>
  )

  const parts: DesignParts = { upload, words, heading, screenshotUrl, reference, onRemove, onReferenceChange, accent, onAccent, sampleImage }

  switch (design) {
    case 'button':
      return <ButtonDesign {...parts} />
    case 'steps':
      return <StepsDesign {...parts} />
    case 'compact':
      return <CompactDesign {...parts} />
    case 'reference':
      return <ReferenceFirstDesign {...parts} />
    default:
      return <ClassicDesign {...parts} />
  }
}

interface DesignParts {
  upload: Upload
  words: Words
  heading: ReactNode
  screenshotUrl: string
  reference: string
  onRemove: () => void
  onReferenceChange: (value: string) => void
  accent: string
  onAccent: string
  sampleImage: string | null
}

const BOX = 'rounded-2xl border border-[color:var(--co-border)] bg-[var(--co-card)] p-4'

function uploadingIcon(isUploading: boolean, Icon: typeof ImagePlus, className: string) {
  return isUploading ? <Loader2 className={cn(className, 'animate-spin')} /> : <Icon className={className} />
}

/** The pre-2026-11-12 box: a dashed drop zone, "or", the reference number. */
function ClassicDesign({ upload, words, heading, screenshotUrl, reference, onRemove, onReferenceChange, sampleImage }: DesignParts) {
  return (
    <section className={cn('space-y-4', BOX)} aria-label="Proof of payment" data-upload-design="classic">
      {heading}
      <ExampleReceipt image={sampleImage} label={words.example} />
      {screenshotUrl ? (
        <AttachedShot url={screenshotUrl} onRemove={onRemove} />
      ) : upload.configured ? (
        upload.target(
          cn(
            'flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[color:var(--co-border)] px-4 py-5 text-center transition-colors hover:border-[color:var(--co-accent-border)] hover:bg-[var(--co-subtle)]',
            'has-[:focus-visible]:border-[color:var(--co-accent)]',
            FOCUS_WITHIN,
          ),
          <>
            {uploadingIcon(upload.isUploading, ImagePlus, 'h-6 w-6 text-[color:var(--co-muted)]')}
            <span className="text-sm font-medium text-[color:var(--co-text)]">{upload.isUploading ? 'Uploading...' : words.upload}</span>
            <span className="text-xs text-[color:var(--co-muted)]">{FILE_HINT}</span>
          </>,
        )
      ) : (
        <NotConfigured />
      )}
      <OrDivider />
      <ReferenceField label={words.reference} value={reference} onChange={onReferenceChange} />
    </section>
  )
}

/** One big filled "Upload" button; the reference number is the quiet fallback. */
function ButtonDesign({ upload, words, heading, screenshotUrl, reference, onRemove, onReferenceChange, accent, onAccent, sampleImage }: DesignParts) {
  return (
    <section className={cn('space-y-4', BOX)} aria-label="Proof of payment" data-upload-design="button">
      {heading}
      <ExampleReceipt image={sampleImage} label={words.example} />
      {screenshotUrl ? (
        <AttachedShot url={screenshotUrl} onRemove={onRemove} />
      ) : upload.configured ? (
        <div className="space-y-1.5">
          {upload.target(
            cn('flex h-14 w-full items-center justify-center gap-2.5 rounded-full text-base font-semibold shadow-sm transition-opacity hover:opacity-90 has-[:focus-visible]:ring-offset-2', FOCUS_WITHIN),
            <span className="pointer-events-none flex items-center gap-2.5">
              {uploadingIcon(upload.isUploading, Camera, 'h-5 w-5')}
              {upload.isUploading ? 'Uploading...' : words.upload}
            </span>,
            { backgroundColor: accent, color: onAccent },
          )}
          <p className="text-center text-xs text-[color:var(--co-muted)]">{FILE_HINT}</p>
        </div>
      ) : (
        <NotConfigured />
      )}
      <OrDivider />
      <ReferenceField label={words.reference} value={reference} onChange={onReferenceChange} />
    </section>
  )
}

function StepMark({ index, isDone, accent, onAccent }: { index: number; isDone: boolean; accent: string; onAccent: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
        !isDone && 'bg-[var(--co-subtle-strong)] text-[color:var(--co-text)]',
      )}
      style={isDone ? { backgroundColor: accent, color: onAccent } : undefined}
    >
      {isDone ? <Check className="h-3.5 w-3.5" /> : index}
    </span>
  )
}

/** Numbered steps: pay, upload the screenshot, or type the reference. */
function StepsDesign({ upload, words, heading, screenshotUrl, reference, onRemove, onReferenceChange, accent, onAccent, sampleImage }: DesignParts) {
  const hasReference = reference.trim().length > 0
  return (
    <section className={cn('space-y-4', BOX)} aria-label="Proof of payment" data-upload-design="steps">
      {heading}
      <ol className="space-y-4">
        <li className="flex gap-3">
          <StepMark index={1} isDone={false} accent={accent} onAccent={onAccent} />
          <p className="pt-1 text-sm text-[color:var(--co-text)]">Pay using the details above.</p>
        </li>
        <li className="flex gap-3">
          <StepMark index={2} isDone={Boolean(screenshotUrl)} accent={accent} onAccent={onAccent} />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="pt-1 text-sm text-[color:var(--co-text)]">Take a screenshot of your receipt and upload it.</p>
            <ExampleReceipt image={sampleImage} label={words.example} />
            {screenshotUrl ? (
              <AttachedShot url={screenshotUrl} onRemove={onRemove} compact />
            ) : upload.configured ? (
              upload.target(
                cn('flex items-center gap-3 rounded-xl border border-[color:var(--co-border)] px-3 py-3 transition-colors hover:bg-[var(--co-subtle)]', FOCUS_WITHIN),
                <>
                  {uploadingIcon(upload.isUploading, ImagePlus, 'h-5 w-5 shrink-0 text-[color:var(--co-accent)]')}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[color:var(--co-text)]">{upload.isUploading ? 'Uploading...' : words.upload}</span>
                    <span className="block text-xs text-[color:var(--co-muted)]">{FILE_HINT}</span>
                  </span>
                </>,
              )
            ) : (
              <NotConfigured />
            )}
          </div>
        </li>
        <li className="flex gap-3">
          <StepMark index={3} isDone={hasReference} accent={accent} onAccent={onAccent} />
          <div className="min-w-0 flex-1 pt-1">
            <p className="mb-2 text-sm text-[color:var(--co-muted)]">No screenshot? Type the reference number instead.</p>
            <ReferenceField label={words.reference} value={reference} onChange={onReferenceChange} size="small" />
          </div>
        </li>
      </ol>
    </section>
  )
}

/** One slim row and a small reference box: for stores that want the step short. */
function CompactDesign({ upload, words, heading, screenshotUrl, reference, onRemove, onReferenceChange, sampleImage }: DesignParts) {
  return (
    <section className="space-y-3 rounded-2xl bg-[var(--co-subtle)] p-3" aria-label="Proof of payment" data-upload-design="compact">
      {heading}
      <ExampleReceipt image={sampleImage} label={words.example} />
      {screenshotUrl ? (
        <AttachedShot url={screenshotUrl} onRemove={onRemove} compact />
      ) : upload.configured ? (
        upload.target(
          cn('flex h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--co-border)] bg-[var(--co-card)] text-sm font-semibold text-[color:var(--co-text)] transition-colors hover:border-[color:var(--co-accent-border)]', FOCUS_WITHIN),
          <>
            {uploadingIcon(upload.isUploading, Paperclip, 'h-4 w-4 text-[color:var(--co-muted)]')}
            {upload.isUploading ? 'Uploading...' : words.upload}
          </>,
        )
      ) : (
        <NotConfigured />
      )}
      <ReferenceField label={words.reference} value={reference} onChange={onReferenceChange} size="small" />
    </section>
  )
}

/** The reference number first (GCash / bank transfers); the screenshot is the alternative. */
function ReferenceFirstDesign({ upload, words, heading, screenshotUrl, reference, onRemove, onReferenceChange, sampleImage }: DesignParts) {
  return (
    <section className={cn('space-y-4', BOX)} aria-label="Proof of payment" data-upload-design="reference">
      {heading}
      <ReferenceField label={words.reference} value={reference} onChange={onReferenceChange} size="large" />
      <ExampleReceipt image={sampleImage} label={words.example} />
      {screenshotUrl ? (
        <AttachedShot url={screenshotUrl} onRemove={onRemove} compact />
      ) : upload.configured ? (
        upload.target(
          cn('inline-flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-[color:var(--co-accent)] transition-opacity hover:opacity-80', FOCUS_WITHIN),
          <>
            {uploadingIcon(upload.isUploading, ImagePlus, 'h-4 w-4')}
            {upload.isUploading ? 'Uploading...' : (
              <>
                <span className="font-normal text-[color:var(--co-muted)]">or</span> {words.upload}
              </>
            )}
          </>,
        )
      ) : (
        <NotConfigured />
      )}
    </section>
  )
}
