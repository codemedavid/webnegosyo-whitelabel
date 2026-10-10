'use client'

import { useRef, useState } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { FOCUS_RING, OB, PhotoSlot } from './onboarding-ui'
import { shrinkPhoto } from './shrink-photo'

interface MenuPhotoGridProps {
  urls: readonly string[]
  max: number
  /** Resolves to an error message, or null on success. */
  onUpload: (file: File) => Promise<string | null>
  onRemove: (index: number) => Promise<string | null>
}

const TILE_CLASS = 'flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border'

function skippedNote(skipped: number, max: number): string | null {
  if (skipped === 0) return null
  const subject = skipped === 1 ? '1 photo was' : `${skipped} photos were`
  return `${subject} not added — up to ${max} menu photos.`
}

/**
 * The menu step's photos: one file dialog takes several pages at once. Pages
 * upload one after another, because each reply carries every photo so far and
 * the last reply must be the fullest. A failed page never stops the rest.
 */
export function MenuPhotoGrid({ urls, max, onUpload, onRemove }: MenuPhotoGridProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const isUploading = pendingCount > 0
  const canAdd = !isUploading && urls.length < max

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (picked.length === 0) return

    const accepted = picked.slice(0, Math.max(0, max - urls.length))
    const failures: string[] = []
    setError(null)
    setPendingCount(accepted.length)
    for (const file of accepted) {
      const failure = await onUpload(await shrinkPhoto(file))
      if (failure) failures.push(failure)
      setPendingCount((count) => count - 1)
    }
    const notes = [failures[0], skippedNote(picked.length - accepted.length, max)].filter(Boolean)
    setError(notes.length > 0 ? notes.join(' ') : null)
  }

  const label = urls.length === 0 ? 'Add photos' : 'Add pages'

  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        {urls.map((url, index) => (
          <PhotoSlot
            key={url}
            label={`Menu page ${index + 1}`}
            imageUrl={url}
            onUpload={async () => null}
            onRemove={() => onRemove(index)}
          />
        ))}
        {Array.from({ length: pendingCount }, (_, index) => (
          <div key={`pending-${index}`} className={TILE_CLASS} style={{ borderColor: OB.line, backgroundColor: OB.wash }}>
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: OB.ink }} aria-label="Uploading" />
          </div>
        ))}
        {canAdd && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={`${TILE_CLASS} flex-col gap-2 border-dashed px-3 text-center transition-colors hover:border-[#17130F] ${FOCUS_RING}`}
            style={{ borderColor: OB.lineStrong, backgroundColor: OB.wash }}
          >
            <Camera className="h-6 w-6" strokeWidth={1.75} style={{ color: OB.ink }} aria-hidden />
            <span className="text-sm font-semibold" style={{ color: OB.ink }}>{label}</span>
            <span className="text-xs" style={{ color: OB.muted }}>Pick up to {max - urls.length}</span>
          </button>
        )}
      </div>
      {canAdd && (
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          aria-label="Choose menu photos"
          className="hidden"
          onChange={handleFiles}
        />
      )}
      {error && <p role="alert" className="mt-2 text-[13px] font-medium text-red-700">{error}</p>}
    </div>
  )
}
