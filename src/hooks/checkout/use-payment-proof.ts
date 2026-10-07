'use client'

/**
 * The customer's payment proof: an uploaded screenshot and/or a typed reference.
 *
 * Moved out of useCheckout. A replaced or removed screenshot is deleted from
 * storage best-effort, so abandoned uploads don't pile up; the folder-scoped
 * guard runs server-side on the file path derived from the URL.
 */
import { useState } from 'react'
import { extractImageKitFilePath } from '@/lib/imagekit-utils'
import type { PaymentProofState } from '@/lib/checkout/order-submit-fields'

const PROOF_DELETE_ENDPOINT = '/api/payment-proof/delete'

/** Best-effort delete of an ImageKit payment-proof asset (replace/remove cleanup). */
function deleteProofAsset(fileId: string, url: string): void {
  if (!fileId || !url) return
  const filePath = extractImageKitFilePath(url)
  if (!filePath) return
  fetch(PROOF_DELETE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, filePath }),
  }).catch(error => console.warn('[Checkout] Proof cleanup failed:', error))
}

export interface UsePaymentProofResult {
  paymentProof: PaymentProofState
  setPaymentProofReference: (reference: string) => void
  /** Upload callback: deletes the previously uploaded screenshot before storing the new one. */
  handlePaymentProofUploaded: (url: string, fileId: string) => void
  handleRemovePaymentProof: () => void
}

export function usePaymentProof(): UsePaymentProofResult {
  const [url, setUrl] = useState('')
  const [publicId, setPublicId] = useState('')
  const [reference, setPaymentProofReference] = useState('')

  const handlePaymentProofUploaded = (nextUrl: string, fileId: string) => {
    if (publicId && publicId !== fileId) deleteProofAsset(publicId, url)
    setUrl(nextUrl)
    setPublicId(fileId)
  }

  const handleRemovePaymentProof = () => {
    if (publicId) deleteProofAsset(publicId, url)
    setUrl('')
    setPublicId('')
  }

  return {
    paymentProof: { url, publicId, reference },
    setPaymentProofReference,
    handlePaymentProofUploaded,
    handleRemovePaymentProof,
  }
}
