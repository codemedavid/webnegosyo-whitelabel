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
import { Upload, X, Receipt, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
}

const VALID_TYPES = ['image/png', 'image/jpg', 'image/jpeg', 'image/webp']

export function PaymentProofField({
  required,
  screenshotUrl,
  reference,
  onUploaded,
  onRemove,
  onReferenceChange,
}: PaymentProofFieldProps) {
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const configured = isImageKitConfigured()

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

  return (
    <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-gray-900 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-emerald-600" />
          Payment Proof
          {required ? (
            <span className="text-red-500">*</span>
          ) : (
            <span className="text-xs font-normal text-gray-400">(optional)</span>
          )}
        </h4>
      </div>

      <p className="text-sm text-gray-600">
        {required
          ? 'Upload a screenshot of your payment or enter your reference number to continue.'
          : 'Optionally upload a screenshot or enter your payment reference number.'}
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpg,image/jpeg,image/webp"
        onChange={handleFileSelect}
        disabled={isUploading}
        className="hidden"
      />

      {/* Screenshot upload */}
      {screenshotUrl ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={screenshotUrl}
            alt="Payment proof"
            className="h-40 w-40 object-cover rounded-lg border-2 border-emerald-300"
          />
          <button
            type="button"
            onClick={onRemove}
            className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 shadow-lg"
            aria-label="Remove screenshot"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : configured ? (
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto border-emerald-300 text-emerald-700 hover:bg-emerald-100"
          disabled={isUploading}
          onClick={(e) => {
            e.preventDefault()
            fileInputRef.current?.click()
          }}
        >
          {isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload Screenshot
            </>
          )}
        </Button>
      ) : (
        <div className="text-xs text-gray-500">Screenshot upload is not configured.</div>
      )}

      {/* Reference number */}
      <div className="space-y-1.5">
        <Label htmlFor="payment-proof-reference" className="text-sm text-gray-700">
          Reference / Transaction Number
        </Label>
        <Input
          id="payment-proof-reference"
          value={reference}
          onChange={(e) => onReferenceChange(e.target.value)}
          placeholder="e.g. 0091234567890"
          maxLength={120}
          className="bg-white"
        />
      </div>
    </div>
  )
}
