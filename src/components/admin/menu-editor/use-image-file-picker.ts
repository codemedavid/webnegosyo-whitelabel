'use client'

/**
 * One photo upload flow for the dish editor: pick a file, check it is a
 * reasonable photo, upload it through the signed ImageKit path, hand back the
 * URL. The dish photo and each option's photo share it.
 */

import { useRef, useState, type ChangeEvent } from 'react'
import { toast } from 'sonner'
import { isImageKitConfigured, uploadImageToImageKit } from '@/lib/imagekit-upload'

export const VALID_IMAGE_TYPES = ['image/png', 'image/jpg', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_SIZE_BYTES = 5 * 1024 * 1024

export function useImageFilePicker(folder: string, onUploaded: (url: string) => void) {
  const [isUploading, setIsUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const pick = () => inputRef.current?.click()

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!VALID_IMAGE_TYPES.includes(file.type)) {
      toast.error('That file is not a photo. Use a PNG, JPG, WEBP or GIF.')
      return
    }
    if (file.size > MAX_SIZE_BYTES) {
      toast.error('That photo is over 5MB. Try a smaller one.')
      return
    }
    setIsUploading(true)
    try {
      const result = await uploadImageToImageKit(file, { folder })
      onUploaded(result.url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The photo did not upload. Please try again.')
    } finally {
      setIsUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return {
    isConfigured: isImageKitConfigured(),
    isUploading,
    pick,
    inputProps: {
      ref: inputRef,
      type: 'file' as const,
      accept: VALID_IMAGE_TYPES.join(','),
      onChange: handleChange,
      disabled: isUploading,
      className: 'hidden',
      'aria-hidden': true,
      tabIndex: -1,
    },
  }
}
