'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, FileText } from 'lucide-react'
import type { ExpenseReceipt } from '@/lib/expenses/rows'
import { fetchReceiptLink } from './receipt-client'

type LinkState = { kind: 'loading' } | { kind: 'ready'; url: string } | { kind: 'failed'; error: string }

/**
 * Receipts from the private bucket, each through its own 5-minute signed link,
 * fetched only when the sheet shows it. Images preview inline; a PDF opens in
 * a new tab.
 */
export function ReceiptPreviews({ receipts }: { receipts: readonly ExpenseReceipt[] }) {
  if (receipts.length === 0) return null
  return (
    <ul className="grid grid-cols-2 gap-2">
      {receipts.map((receipt, index) => (
        <li key={receipt.id}>
          <ReceiptTile receipt={receipt} number={index + 1} />
        </li>
      ))}
    </ul>
  )
}

function ReceiptTile({ receipt, number }: { receipt: ExpenseReceipt; number: number }) {
  const [link, setLink] = useState<LinkState>({ kind: 'loading' })
  const isPdf = receipt.mime === 'application/pdf'

  useEffect(() => {
    let isCurrent = true
    void fetchReceiptLink(receipt.id).then((result) => {
      if (!isCurrent) return
      setLink(result.ok ? { kind: 'ready', url: result.data.url } : { kind: 'failed', error: result.error })
    })
    return () => {
      isCurrent = false
    }
  }, [receipt.id])

  const label = `Receipt ${number}${isPdf ? ' (PDF)' : ''}`
  if (link.kind === 'loading') {
    return <div className="aspect-[4/5] animate-pulse rounded-xl bg-wn-sand ring-1 ring-wn-line" aria-label={`Loading ${label}`} />
  }
  if (link.kind === 'failed') {
    return (
      <div className="flex aspect-[4/5] items-center justify-center rounded-xl bg-wn-sand p-3 text-center text-[12.5px] text-wn-stone ring-1 ring-wn-line">
        {link.error}
      </div>
    )
  }
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block aspect-[4/5] overflow-hidden rounded-xl bg-wn-sand ring-1 ring-wn-line outline-none focus-visible:ring-2 focus-visible:ring-wn-ink"
    >
      {isPdf ? (
        <span className="flex h-full flex-col items-center justify-center gap-2 text-wn-ink">
          <FileText className="size-8 text-wn-stone" aria-hidden />
          <span className="text-[13px] font-semibold">Open PDF</span>
        </span>
      ) : (
        // A signed, short-lived URL from our own bucket: next/image would cache it past its expiry.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={link.url} alt={label} loading="lazy" className="h-full w-full object-cover" />
      )}
      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11.5px] font-semibold text-wn-ink shadow-sm">
        <ExternalLink className="size-3" aria-hidden />
        View
        <span className="sr-only"> {label} (opens in a new tab)</span>
      </span>
    </a>
  )
}
