'use client'

import { useState } from 'react'
import { CldUploadWidget } from 'next-cloudinary'
import { Upload, X, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface ImageUploadProps {
  currentImageUrl?: string
  onImageUploaded: (url: string) => void
  folder?: string
  label?: string
  description?: string
  disabled?: boolean
}

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

  const cloudinaryPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleUploadSuccess = (result: any) => {
    setIsUploading(false)
    if (result?.info?.secure_url) {
      const url = result.info.secure_url
      setUploadedUrl(url)
      onImageUploaded(url)
    }
  }

  const handleRemove = () => {
    setUploadedUrl('')
    onImageUploaded('')
  }

  const displayUrl = uploadedUrl || currentImageUrl

  if (!cloudinaryPreset) {
    return (
      <div className="space-y-2">
        {label && <Label>{label}</Label>}
        <div className="p-4 border border-yellow-300 bg-yellow-50 rounded-md text-sm text-yellow-800">
          ⚠️ Cloudinary is not configured. Please set NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET in your environment variables.
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

      {/* Preview */}
      {displayUrl && (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayUrl}
            alt="Preview"
            className="h-32 w-32 object-cover rounded-lg border-2 border-gray-200"
          />
          {!disabled && (
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
      <CldUploadWidget
        uploadPreset={cloudinaryPreset}
        options={{
          folder,
          maxFiles: 1,
          resourceType: 'image',
          clientAllowedFormats: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
          maxFileSize: 5000000, // 5MB
          sources: ['local', 'url', 'camera'],
          multiple: false,
        }}
        onSuccess={handleUploadSuccess}
        onOpen={() => setIsUploading(true)}
        onClose={() => setIsUploading(false)}
      >
        {({ open }) => {
          return (
            <Button
              type="button"
              variant="outline"
              onClick={(e) => {
                e.preventDefault()
                open()
              }}
              disabled={disabled || isUploading}
              className="w-full sm:w-auto"
            >
              {isUploading ? (
                <>
                  <div className="h-4 w-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mr-2" />
                  Uploading...
                </>
              ) : displayUrl ? (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Change Image
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Image
                </>
              )}
            </Button>
          )
        }}
      </CldUploadWidget>

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
