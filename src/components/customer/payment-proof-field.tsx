'use client'

/**
 * Payment proof field — screenshot upload (Cloudinary) and/or reference number.
 *
 * Rendered inside the shared PaymentDetailsDialog so all checkout templates get
 * it. When the selected payment method requires proof, the customer must provide
 * at least one of: a screenshot or a reference number (enforced in useCheckout
 * before the order is submitted).
 */

import { CldUploadWidget } from 'next-cloudinary'
import { Upload, X, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  PAYMENT_PROOF_FOLDER,
  PAYMENT_PROOF_ALLOWED_FORMATS,
  PAYMENT_PROOF_MAX_FILE_SIZE,
} from '@/lib/payment-proof'

interface PaymentProofFieldProps {
  required: boolean
  screenshotUrl: string
  reference: string
  onUploaded: (url: string, publicId: string) => void
  onRemove: () => void
  onReferenceChange: (value: string) => void
}

interface CloudinaryUploadResult {
  info?: { secure_url?: string; public_id?: string }
}

export function PaymentProofField({
  required,
  screenshotUrl,
  reference,
  onUploaded,
  onRemove,
  onReferenceChange,
}: PaymentProofFieldProps) {
  const cloudinaryPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET

  const handleSuccess = (result: unknown) => {
    const info = (result as CloudinaryUploadResult)?.info
    if (info?.secure_url && info?.public_id) {
      onUploaded(info.secure_url, info.public_id)
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
      ) : cloudinaryPreset ? (
        <CldUploadWidget
          uploadPreset={cloudinaryPreset}
          options={{
            folder: PAYMENT_PROOF_FOLDER,
            maxFiles: 1,
            resourceType: 'image',
            clientAllowedFormats: [...PAYMENT_PROOF_ALLOWED_FORMATS],
            maxFileSize: PAYMENT_PROOF_MAX_FILE_SIZE,
            sources: ['local', 'camera'],
            multiple: false,
          }}
          onSuccess={handleSuccess}
        >
          {({ open }) => (
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto border-emerald-300 text-emerald-700 hover:bg-emerald-100"
              onClick={(e) => {
                e.preventDefault()
                open()
              }}
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload Screenshot
            </Button>
          )}
        </CldUploadWidget>
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
