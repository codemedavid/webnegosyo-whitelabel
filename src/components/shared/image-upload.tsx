'use client'

import { useRef, useState } from 'react'
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { uploadImageToImageKit, isImageKitConfigured } from '@/lib/imagekit-upload'

interface ImageUploadProps {
  currentImageUrl?: string
  onImageUploaded: (url: string) => void
  folder?: string
  label?: string
  description?: string
  disabled?: boolean
}

const VALID_TYPES = ['image/png', 'image/jpg', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

export function ImageUpload({
  currentImageUrl,
  onImageUploaded,
  folder = 'tenants',
  label = 'Image',
  description,
  disabled = false,
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadedUrl, setUploadedUrl] = useState(currentImageUrl || '')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const configured = isImageKitConfigured()

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!VALID_TYPES.includes(file.type)) {
      toast.error('Invalid file type. Please upload PNG, JPG, WEBP, or GIF.')
      return
    }
    if (file.size > MAX_SIZE) {
      toast.error('File too large. Maximum size is 5MB.')
      return
    }

    setIsUploading(true)
    try {
      const result = await uploadImageToImageKit(file, { folder })
      setUploadedUrl(result.url)
      onImageUploaded(result.url)
      toast.success('Image uploaded successfully')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed. Please try again.')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemove = () => {
    setUploadedUrl('')
    onImageUploaded('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const displayUrl = uploadedUrl || currentImageUrl

  if (!configured) {
    return (
      <div className="space-y-2">
        {label && <Label>{label}</Label>}
        <div className="p-4 border border-yellow-300 bg-yellow-50 rounded-md text-sm text-yellow-800">
          ⚠️ Image upload is not configured. Please set NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY and NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT in your environment variables.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {label && (
        <Label>
          {label}
          {description && (
            <span className="block text-xs font-normal text-muted-foreground mt-1">
              {description}
            </span>
          )}
        </Label>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpg,image/jpeg,image/webp,image/gif"
        onChange={handleFileSelect}
        disabled={disabled || isUploading}
        className="hidden"
      />

      {/* Preview */}
      {displayUrl && (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayUrl}
            alt="Preview"
            className="h-32 w-32 object-cover rounded-lg border-2 border-gray-200"
          />
          {!disabled && !isUploading && (
            <button
              type="button"
              onClick={handleRemove}
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 shadow-lg"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* Upload Button */}
      <Button
        type="button"
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || isUploading}
        className="w-full sm:w-auto"
      >
        {isUploading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <Upload className="mr-2 h-4 w-4" />
            {displayUrl ? 'Change Image' : 'Upload Image'}
          </>
        )}
      </Button>

      {!displayUrl && (
        <div className="flex items-start gap-2 text-xs text-gray-500">
          <ImageIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <p>Recommended: Square image (1:1 ratio), max 5MB</p>
            <p>Supported: PNG, JPG, WEBP, GIF</p>
          </div>
        </div>
      )}
    </div>
  )
}
