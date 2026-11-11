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

/**
 * Best-effort delete of an ImageKit payment-proof asset (replace/remove
 * cleanup). The route deletes only with the token the upload handed back.
 */
function deleteProofAsset(fileId: string, url: string, deleteToken: string): void {
  if (!fileId || !url || !deleteToken) return
  const filePath = extractImageKitFilePath(url)
  if (!filePath) return
  fetch(PROOF_DELETE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, filePath, deleteToken }),
  }).catch(error => console.warn('[Checkout] Proof cleanup failed:', error))
}

export interface UsePaymentProofResult {
  paymentProof: PaymentProofState
  setPaymentProofReference: (reference: string) => void
  /** Upload callback: deletes the previously uploaded screenshot before storing the new one. */
  handlePaymentProofUploaded: (url: string, fileId: string, deleteToken?: string) => void
  handleRemovePaymentProof: () => void
}

export function usePaymentProof(): UsePaymentProofResult {
  const [url, setUrl] = useState('')
  const [publicId, setPublicId] = useState('')
  const [reference, setPaymentProofReference] = useState('')
  // Never leaves the browser except to the delete route; not part of the order.
  const [deleteToken, setDeleteToken] = useState('')

  const handlePaymentProofUploaded = (nextUrl: string, fileId: string, nextDeleteToken = '') => {
    if (publicId && publicId !== fileId) deleteProofAsset(publicId, url, deleteToken)
    setUrl(nextUrl)
    setPublicId(fileId)
    setDeleteToken(nextDeleteToken)
  }

  const handleRemovePaymentProof = () => {
    if (publicId) deleteProofAsset(publicId, url, deleteToken)
    setUrl('')
    setPublicId('')
    setDeleteToken('')
  }

  return {
    paymentProof: { url, publicId, reference },
    setPaymentProofReference,
    handlePaymentProofUploaded,
    handleRemovePaymentProof,
  }
}
