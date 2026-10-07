'use client'

import { FileArchive, Loader2, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { QrArtwork } from '@/lib/qr-print/qr-artwork'
import type { QrItem } from '@/lib/qr-print/qr-items'
import { QrCodeTile } from './qr-code-tile'
import type { DownloadFormat } from './use-qr-export'

interface QrCodeGroupProps {
  groupKey: string
  title: string
  description?: string
  items: QrItem[]
  artworks: ReadonlyMap<string, QrArtwork | null>
  labelFor: (item: QrItem) => string
  busyKey: string | null
  onDownload: (item: QrItem, format: DownloadFormat) => void
  onDownloadAll: (groupKey: string, items: QrItem[]) => void
  onPrint: (groupKey: string, items: QrItem[]) => void
}

/** A titled grid of codes with "download all" and "print" for the whole set. */
export function QrCodeGroup({
  groupKey,
  title,
  description,
  items,
  artworks,
  labelFor,
  busyKey,
  onDownload,
  onDownloadAll,
  onPrint,
}: QrCodeGroupProps) {
  const isBusy = (action: string) => busyKey === `${groupKey}:${action}`
  const isMany = items.length > 1

  return (
    <section className="space-y-3" aria-label={title}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {title} <span className="text-sm font-normal text-muted-foreground">· {items.length}</span>
          </h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <div className="flex gap-2">
          {isMany && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busyKey !== null}
              onClick={() => onDownloadAll(groupKey, items)}
            >
              {isBusy('zip') ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileArchive className="h-4 w-4" aria-hidden />}
              Download all (ZIP)
            </Button>
          )}
          <Button type="button" size="sm" disabled={busyKey !== null} onClick={() => onPrint(groupKey, items)}>
            {isBusy('print') ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Printer className="h-4 w-4" aria-hidden />}
            {isMany ? 'Print all' : 'Print'}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {items.map((item) => (
          <QrCodeTile
            key={item.id}
            item={item}
            artwork={artworks.get(item.id) ?? null}
            label={labelFor(item)}
            busyKey={busyKey}
            onDownload={onDownload}
          />
        ))}
      </div>
    </section>
  )
}
