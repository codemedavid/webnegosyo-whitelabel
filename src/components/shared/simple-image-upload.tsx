'use client'

import { useState, useRef } from 'react'
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

interface SimpleImageUploadProps {
  currentImageUrl?: string
  onImageUploaded: (url: string) => void
  folder?: string
  label?: string
  description?: string
  disabled?: boolean
}

export function SimpleImageUpload({
  currentImageUrl,
  onImageUploaded,
  folder = 'tenants',
  label = 'Image',
  description,
  disabled = false,
}: SimpleImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadedUrl, setUploadedUrl] = useState(currentImageUrl || '')
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const validTypes = ['image/png', 'image/jpg', 'image/jpeg', 'image/webp', 'image/gif']
    if (!validTypes.includes(file.type)) {
      toast.error('Invalid file type. Please upload PNG, JPG, WEBP, or GIF.')
      return
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      toast.error('File too large. Maximum size is 5MB.')
      return
    }

    await uploadToCloudinary(file)
  }

  const uploadToCloudinary = async (file: File) => {
    if (!cloudName || !uploadPreset) {
      toast.error('Cloudinary is not configured. Please set environment variables.')
      return
    }

    setIsUploading(true)
    setUploadProgress(0)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('upload_preset', uploadPreset)
      formData.append('folder', folder)

      const xhr = new XMLHttpRequest()

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100)
          setUploadProgress(percentComplete)
        }
      })

      // Handle upload completion
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText)
          const url = response.secure_url
          setUploadedUrl(url)
          onImageUploaded(url)
          toast.success('Image uploaded successfully')
          
          // Reset file input
          if (fileInputRef.current) {
            fileInputRef.current.value = ''
          }
        } else {
          toast.error('Upload failed. Please try again.')
        }
        setIsUploading(false)
        setUploadProgress(0)
      })

      // Handle upload error
      xhr.addEventListener('error', () => {
        toast.error('Upload failed. Please check your connection.')
        setIsUploading(false)
        setUploadProgress(0)
      })

      // Send request
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`)
      xhr.send(formData)
    } catch (error) {
      console.error('Upload error:', error)
      toast.error('Upload failed. Please try again.')
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  const handleRemove = () => {
    setUploadedUrl('')
    onImageUploaded('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleButtonClick = () => {
    fileInputRef.current?.click()
  }

  const displayUrl = uploadedUrl || currentImageUrl

  if (!cloudName || !uploadPreset) {
    return (
      <div className="space-y-2">
        {label && <Label>{label}</Label>}
        <div className="p-4 border border-yellow-300 bg-yellow-50 rounded-md text-sm text-yellow-800">
          ⚠️ Cloudinary is not configured. Please set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET in your environment variables.
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

      {/* Hidden file input */}
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
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 shadow-lg transition-colors"
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
        onClick={handleButtonClick}
        disabled={disabled || isUploading}
        className="w-full sm:w-auto"
      >
        {isUploading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Uploading {uploadProgress}%
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

      {/* Upload Progress Bar */}
      {isUploading && (
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className="bg-orange-500 h-2 transition-all duration-300 ease-out"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      )}

      {/* Help Text */}
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

