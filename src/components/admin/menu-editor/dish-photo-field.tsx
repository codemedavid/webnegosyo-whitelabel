'use client'

/**
 * The dish photo as one tappable tile: empty, it says "Add photo"; filled, it
 * shows the photo the way the menu will, with Change and Remove beneath.
 * Uploads go through the same signed ImageKit path as every admin image.
 */

import { ImagePlus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useImageFilePicker } from '@/components/admin/menu-editor/use-image-file-picker'

interface DishPhotoFieldProps {
  imageUrl: string
  onChange: (url: string) => void
  hasError?: boolean
}

export function DishPhotoField({ imageUrl, onChange, hasError }: DishPhotoFieldProps) {
  const { isConfigured, isUploading, pick: pickFile, inputProps } = useImageFilePicker('menu-items', onChange)

  if (!isConfigured) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
        Photo upload is not set up for this store yet.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <input {...inputProps} />
      <button
        id="image_url"
        type="button"
        onClick={pickFile}
        disabled={isUploading}
        aria-label={imageUrl ? 'Change dish photo' : 'Add dish photo'}
        className={cn(
          'relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          !imageUrl && 'border-dashed hover:border-foreground/40 hover:bg-muted/70',
          hasError && 'border-destructive',
        )}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1.5 px-3 text-center text-muted-foreground">
            <ImagePlus className="h-7 w-7" aria-hidden />
            <span className="text-sm font-semibold text-foreground">Add photo</span>
            <span className="text-xs">Landscape works best</span>
          </span>
        )}
        {isUploading && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="h-6 w-6 animate-spin" aria-label="Uploading photo" />
          </span>
        )}
      </button>
      {imageUrl && !isUploading && (
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={pickFile}>
            Change
          </Button>
          <Button type="button" variant="ghost" size="sm" className="flex-1 text-muted-foreground" onClick={() => onChange('')}>
            Remove
          </Button>
        </div>
      )}
    </div>
  )
}
