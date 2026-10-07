'use client'

import { Download, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { QrArtwork } from '@/lib/qr-print/qr-artwork'
import type { QrItem } from '@/lib/qr-print/qr-items'
import { svgDataUri } from '@/lib/qr-print/print-sheet'
import type { DownloadFormat } from './use-qr-export'

interface QrCodeTileProps {
  item: QrItem
  artwork: QrArtwork | null
  label: string
  busyKey: string | null
  onDownload: (item: QrItem, format: DownloadFormat) => void
}

export function QrCodeTile({ item, artwork, label, busyKey, onDownload }: QrCodeTileProps) {
  const isBusy = (format: DownloadFormat) => busyKey === `${item.id}:${format}`

  return (
    <figure className="flex flex-col overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-center bg-muted/40 p-3">
        {artwork ? (
          // eslint-disable-next-line @next/next/no-img-element -- an inline SVG data URI; next/image adds nothing here
          <img
            src={svgDataUri(artwork.svg)}
            alt={`QR code: ${label}`}
            className="h-auto max-h-80 w-full object-contain"
            width={artwork.width}
            height={artwork.height}
          />
        ) : (
          <p className="p-6 text-center text-sm text-muted-foreground">This link is too long for a QR code.</p>
        )}
      </div>
      <figcaption className="space-y-2 border-t p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium" title={label}>
            {label}
          </span>
          {item.isTyped && (
            <Badge variant="secondary" className="shrink-0">
              Typed
            </Badge>
          )}
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground" title={item.url}>
          {item.url.replace(/^https?:\/\//, '')}
        </p>
        <div className="flex gap-2">
          {(['png', 'svg'] as const).map((format) => (
            <Button
              key={format}
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={!artwork || busyKey !== null}
              onClick={() => onDownload(item, format)}
            >
              {isBusy(format) ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
              {format.toUpperCase()}
            </Button>
          ))}
        </div>
      </figcaption>
    </figure>
  )
}
