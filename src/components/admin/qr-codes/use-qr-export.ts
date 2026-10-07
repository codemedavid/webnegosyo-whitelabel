'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { downloadPng, downloadPngZip, downloadSvg, printSheet } from '@/lib/qr-print/browser-export'
import type { QrArtwork } from '@/lib/qr-print/qr-artwork'
import { buildPrintSheetHtml, type CodesPerPage } from '@/lib/qr-print/print-sheet'

export type DownloadFormat = 'png' | 'svg'

export interface ExportEntry {
  fileName: string
  artwork: QrArtwork
}

/**
 * Downloads and printing, one at a time. `busyKey` names the action running
 * so only its button shows a spinner; every failure becomes a toast.
 */
export function useQrExport(perPage: CodesPerPage) {
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const run = useCallback(async (key: string, action: () => Promise<void> | void, failure: string) => {
    setBusyKey(key)
    try {
      await action()
    } catch (error) {
      console.error('[qr-codes] export failed', { key, error })
      toast.error(failure)
    } finally {
      setBusyKey(null)
    }
  }, [])

  const downloadOne = useCallback(
    (key: string, entry: ExportEntry, format: DownloadFormat) =>
      run(
        key,
        () => (format === 'svg' ? downloadSvg(entry.artwork, entry.fileName) : downloadPng(entry.artwork, entry.fileName)),
        'Could not download that QR code. Try again, or use SVG.'
      ),
    [run]
  )

  const downloadAll = useCallback(
    (key: string, entries: ExportEntry[], zipName: string) =>
      run(key, () => downloadPngZip(entries, zipName), 'Could not build the ZIP. Try again with fewer codes.'),
    [run]
  )

  const print = useCallback(
    (key: string, entries: ExportEntry[], title: string) =>
      run(
        key,
        () => printSheet(buildPrintSheetHtml({ title, artworks: entries.map((e) => e.artwork), perPage })),
        'Could not open the print dialog.'
      ),
    [run, perPage]
  )

  return { busyKey, downloadOne, downloadAll, print }
}
