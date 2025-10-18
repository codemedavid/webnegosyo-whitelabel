'use client'

import { useState, useEffect } from 'react'
import { CldUploadWidget } from 'next-cloudinary'
import { Upload, X, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import Image from 'next/image'

interface ImageUploadProps {
  value?: string
  onChange: (url: string) => void
  onRemove?: () => void
  label?: string
  description?: string
  folder?: string
  disabled?: boolean
}

export function ImageUpload({
  value,
  onChange,
  onRemove,
  label = 'Image',
  description,
  folder = 'tenants',
  disabled = false,
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleUploadSuccess = (result: any) => {
    setIsUploading(false)
    if (result?.info?.secure_url) {
      onChange(result.info.secure_url)
    }
  }

  // Don't render Cloudinary component until mounted (client-side only)
  const cloudinaryPreset = typeof window !== 'undefined' 
    ? process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET 
    : undefined

  const handleRemove = () => {
    if (onRemove) {
      onRemove()
    } else {
      onChange('')
    }
  }

  return (
    <div className="space-y-2">
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

      <div className="flex items-start gap-4">
        {/* Preview */}
        {value ? (
          <div className="relative group">
            <div className="relative h-32 w-32 rounded-lg overflow-hidden border-2 border-gray-200">
              <Image
                src={value}
                alt="Upload preview"
                fill
                className="object-cover"
                sizes="128px"
              />
            </div>
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={handleRemove}
              disabled={disabled}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div className="h-32 w-32 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
            <ImageIcon className="h-8 w-8 text-gray-400" />
          </div>
        )}

        {/* Upload Widget */}
        <div className="flex-1 space-y-2">
          {isMounted && cloudinaryPreset ? (
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
                cropping: true,
                croppingAspectRatio: 1, // Square crop for logos
                croppingShowDimensions: true,
                showSkipCropButton: false,
              }}
              onSuccess={handleUploadSuccess}
              onOpen={() => setIsUploading(true)}
              onClose={() => setIsUploading(false)}
            >
              {({ open }) => (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => open()}
                  disabled={disabled || isUploading}
                  className="w-full"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {isUploading ? 'Uploading...' : value ? 'Change Image' : 'Upload Image'}
                </Button>
              )}
            </CldUploadWidget>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled
              className="w-full"
            >
              <Upload className="mr-2 h-4 w-4" />
              {isMounted ? 'Cloudinary not configured' : 'Loading...'}
            </Button>
          )}

          {!value && (
            <p className="text-xs text-muted-foreground">
              Recommended: Square image (1:1 ratio), max 5MB
              <br />
              Supported formats: PNG, JPG, WEBP, GIF
            </p>
          )}
          
          {value && (
            <p className="text-xs text-green-600 flex items-center gap-1">
              ✓ Image uploaded successfully
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

