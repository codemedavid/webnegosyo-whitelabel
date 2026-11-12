import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { useRef, useState } from 'react'
import { PROOF_JPEG_QUALITY, shrinkTarget, type ProofFile, type UploadedProof } from '@/lib/checkout/payment-proof-upload'
import { uploadPaymentProof } from '@/lib/data/hooks'

export type PaymentProofState =
  | { status: 'none' }
  | { status: 'uploading'; previewUri: string }
  | { status: 'ready'; previewUri: string; proof: UploadedProof }
  | { status: 'failed'; previewUri: string; error: string }

/**
 * Re-encode as JPEG with the long edge ≤1600 px. iPhones save HEIC, which the
 * upload route refuses, and a full-size photo can pass Vercel's body limit.
 */
async function shrinkToJpeg(asset: { uri: string; width: number; height: number }): Promise<ProofFile> {
  const context = ImageManipulator.manipulate(asset.uri)
  const target = shrinkTarget(asset.width, asset.height)
  if (target) context.resize(target)
  const image = await context.renderAsync()
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: PROOF_JPEG_QUALITY })
  return { uri: saved.uri, name: 'payment-proof.jpg', type: 'image/jpeg' }
}

/** The payment screenshot: picked from the photo library, uploaded right away, removable. */
export function usePaymentProof() {
  const [state, setState] = useState<PaymentProofState>({ status: 'none' })
  // A later pick or a Remove makes an upload still in flight irrelevant.
  const latest = useRef(0)

  const upload = async (asset: { uri: string; width: number; height: number }) => {
    const mine = ++latest.current
    setState({ status: 'uploading', previewUri: asset.uri })
    try {
      const proof = await uploadPaymentProof(await shrinkToJpeg(asset))
      if (latest.current === mine) setState({ status: 'ready', previewUri: asset.uri, proof })
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'We couldn’t upload your screenshot. Try again.'
      if (latest.current === mine) setState({ status: 'failed', previewUri: asset.uri, error: message })
    }
  }

  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 1 })
    const asset = result.canceled ? undefined : result.assets?.[0]
    if (asset) await upload(asset)
  }

  const remove = () => {
    latest.current += 1
    setState({ status: 'none' })
  }

  return { state, pick: () => void pick(), remove }
}
