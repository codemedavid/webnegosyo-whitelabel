'use client'
/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { ImagePlus, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { uploadImageToImageKit } from '@/lib/imagekit-upload'

interface Props {
  url: string | null
  onChange: (url: string | null) => void
}

const COVER_FOLDER = '/platform/whats-new/covers'

/**
 * The post's hero image: a drop zone while empty, a full-bleed 16:9 image with
 * replace/remove controls once set. Uploads go to ImageKit like every other
 * platform asset.
 */
export function CoverPicker({ url, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const upload = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Cover must be an image')
      return
    }
    setIsUploading(true)
    try {
      const uploaded = await uploadImageToImageKit(file, { folder: COVER_FOLDER })
      onChange(uploaded.url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragging(false)
    void upload(event.dataTransfer.files?.[0])
  }

  const hiddenInput = (
    <input
      ref={input}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        void upload(file)
      }}
    />
  )

  if (url) {
    return (
      <div className="group relative aspect-[21/9] w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
        <img src={url} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <span className="absolute left-4 top-4 rounded-full border border-white/20 bg-black/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/80 backdrop-blur">
          Cover
        </span>
        <div className="absolute bottom-4 right-4 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={isUploading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-white hover:text-black disabled:opacity-50"
          >
            {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Replace
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur transition-colors hover:border-red-400/40 hover:bg-red-500/20 hover:text-red-200"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
        </div>
        {hiddenInput}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      disabled={isUploading}
      className={cn(
        'flex min-h-44 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed py-8 text-center transition-colors',
        isDragging
          ? 'border-white/60 bg-white/[0.08]'
          : 'border-white/15 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.04]',
        'disabled:cursor-wait',
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
        {isUploading ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <ImagePlus className="h-5 w-5 text-white" />}
      </span>
      <span className="text-sm font-medium text-white">{isUploading ? 'Uploading cover…' : 'Drop a cover image'}</span>
      <span className="text-xs text-white/45">or click to browse · 16:9 looks best in the app</span>
      {hiddenInput}
    </button>
  )
}
