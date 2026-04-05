'use client'

import { useState } from 'react'
import { Check, Copy, Upload, Loader2, MessageCircle, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { submitPaymentProof } from '@/app/actions/checkout-leads'
import type { CheckoutLeadWithPaymentMethod } from '@/types/database'

const FACEBOOK_PAGE_USERNAME = 'WebNegosyoOfficial'

interface ConfirmationContentProps {
  lead: CheckoutLeadWithPaymentMethod
}

export function ConfirmationContent({ lead }: ConfirmationContentProps) {
  const [copied, setCopied] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [proofUploaded, setProofUploaded] = useState(!!lead.payment_proof_url)
  const [proofUrl, setProofUrl] = useState(lead.payment_proof_url ?? '')

  const paymentMethod = lead.platform_payment_methods

  const handleCopyRef = async () => {
    await navigator.clipboard.writeText(lead.reference_number)
    setCopied(true)
    toast.success('Reference number copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validTypes = ['image/png', 'image/jpg', 'image/jpeg', 'image/webp']
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a PNG, JPG, or WEBP image.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 5MB.')
      return
    }

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
    const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET

    if (!cloudName || !uploadPreset) {
      toast.error('Upload not configured. Please contact us on Messenger.')
      return
    }

    setIsUploading(true)
    setUploadProgress(0)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('upload_preset', uploadPreset)
    formData.append('folder', 'checkout-proofs')

    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener('progress', (ev) => {
      if (ev.lengthComputable) {
        setUploadProgress(Math.round((ev.loaded / ev.total) * 100))
      }
    })

    xhr.addEventListener('load', async () => {
      if (xhr.status === 200) {
        const response = JSON.parse(xhr.responseText)
        const url = response.secure_url as string

        const result = await submitPaymentProof(lead.reference_number, url)
        if (result.error) {
          toast.error('Failed to save payment proof. Please try again.')
        } else {
          setProofUrl(url)
          setProofUploaded(true)
          toast.success('Payment proof uploaded successfully!')
        }
      } else {
        toast.error('Upload failed. Please try again.')
      }
      setIsUploading(false)
      setUploadProgress(0)
    })

    xhr.addEventListener('error', () => {
      toast.error('Upload failed. Please check your connection.')
      setIsUploading(false)
      setUploadProgress(0)
    })

    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`)
    xhr.send(formData)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <Link href="/checkout" className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-bold">Order Confirmation</h1>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        {/* Reference Number Banner */}
        <div className="rounded-xl bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <Check className="h-7 w-7 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Order Submitted!</h2>
          <p className="mt-1 text-sm text-gray-500">Your reference number</p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <span className="rounded-lg bg-gray-100 px-5 py-3 font-mono text-2xl font-bold tracking-wider text-gray-900">
              {lead.reference_number}
            </span>
            <button
              onClick={handleCopyRef}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              {copied ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5" />}
            </button>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Amount: <span className="font-semibold text-gray-900">P{lead.amount.toLocaleString()}</span>
          </p>
        </div>

        {/* Payment Instructions */}
        {paymentMethod && (
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900">Payment Instructions</h3>
            <p className="mt-1 text-sm text-gray-500">
              Send payment to {paymentMethod.name}
            </p>

            <div className="mt-4 space-y-4">
              {paymentMethod.qr_code_url && (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={paymentMethod.qr_code_url}
                    alt={`${paymentMethod.name} QR Code`}
                    className="h-56 w-56 rounded-lg border object-contain p-2"
                  />
                </div>
              )}

              {paymentMethod.details && (
                <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-700 whitespace-pre-line">
                  {paymentMethod.details}
                </div>
              )}

              <ol className="space-y-2 text-sm text-gray-600">
                <li className="flex gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-600">
                    1
                  </span>
                  {paymentMethod.qr_code_url
                    ? 'Scan the QR code or transfer to the account above'
                    : 'Transfer to the account above'}
                </li>
                <li className="flex gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-600">
                    2
                  </span>
                  Upload your payment proof below
                </li>
                <li className="flex gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-600">
                    3
                  </span>
                  We&apos;ll set you up within 48 hours
                </li>
              </ol>
            </div>
          </div>
        )}

        {/* Payment Proof Upload */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900">Upload Payment Proof</h3>
          <p className="mt-1 text-sm text-gray-500">
            Upload a screenshot of your payment confirmation
          </p>

          <div className="mt-4">
            {proofUploaded && proofUrl ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
                  <Check className="h-4 w-4" />
                  Payment proof uploaded successfully!
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={proofUrl}
                  alt="Payment proof"
                  className="max-h-64 rounded-lg border object-contain"
                />
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-orange-600 hover:text-orange-700">
                  <Upload className="h-4 w-4" />
                  Upload a different screenshot
                  <input
                    type="file"
                    accept="image/png,image/jpg,image/jpeg,image/webp"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-8 transition-colors hover:border-orange-300 hover:bg-orange-50/50">
                {isUploading ? (
                  <>
                    <Loader2 className="mb-2 h-8 w-8 animate-spin text-orange-500" />
                    <p className="text-sm font-medium text-gray-700">Uploading {uploadProgress}%</p>
                    <div className="mt-2 h-2 w-48 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full bg-orange-500 transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="mb-2 h-8 w-8 text-gray-400" />
                    <p className="text-sm font-medium text-gray-700">
                      Click to upload or drag and drop
                    </p>
                    <p className="mt-1 text-xs text-gray-500">PNG, JPG, or WEBP up to 5MB</p>
                  </>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg,image/webp"
                  onChange={handleFileSelect}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        {/* Messenger Link */}
        <div className="rounded-xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-gray-500">Have questions or need help?</p>
          <a
            href={`https://m.me/${FACEBOOK_PAGE_USERNAME}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <MessageCircle className="h-4 w-4" />
            Chat with us on Messenger
          </a>
        </div>
      </div>
    </div>
  )
}
