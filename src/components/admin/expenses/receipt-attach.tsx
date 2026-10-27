'use client'

import { useId, useRef } from 'react'
import { FileText, ImageIcon, Paperclip, X } from 'lucide-react'
import { MAX_RECEIPTS_PER_EXPENSE, RECEIPT_ACCEPT, receiptFileProblem } from './receipt-client'

interface ReceiptAttachProps {
  files: readonly File[]
  onAdd: (files: File[]) => void
  onRemove: (index: number) => void
  problems: readonly string[]
}

/** Splits picked or dropped files into ones that can be attached and the sentences for the rest. */
export function acceptReceiptFiles(
  incoming: readonly File[],
  room: number = MAX_RECEIPTS_PER_EXPENSE,
): { files: File[]; problems: string[] } {
  const files: File[] = []
  const problems: string[] = []
  for (const file of incoming) {
    const problem = receiptFileProblem(file)
    if (problem) problems.push(problem)
    else if (files.length >= room) problems.push(`An expense keeps up to ${MAX_RECEIPTS_PER_EXPENSE} receipts; ${file.name} was left out.`)
    else files.push(file)
  }
  return { files, problems }
}

function sizeText(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * Receipt photos or PDFs, attached after the expense is saved. Dropping a file
 * anywhere on the dialog lands here too (the dialog owns the drop target).
 */
export function ReceiptAttach({ files, onAdd, onRemove, problems }: ReceiptAttachProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-wn-line px-3.5 py-3">
        <p className="text-[13.5px] text-wn-stone">
          <Paperclip className="mr-1.5 inline size-4 align-[-3px] text-wn-stone" aria-hidden />
          Receipt photo or PDF <span className="text-wn-stone/90">· drop it anywhere here</span>
        </p>
        <label
          htmlFor={inputId}
          className="inline-flex min-h-10 cursor-pointer items-center rounded-full bg-white px-3.5 text-[13.5px] font-bold text-wn-ink ring-1 ring-wn-line hover:ring-wn-ink has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-wn-ink"
        >
          Choose file
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={RECEIPT_ACCEPT}
            multiple
            className="sr-only"
            onChange={(event) => {
              const picked = Array.from(event.target.files ?? [])
              if (picked.length > 0) onAdd(picked)
              if (inputRef.current) inputRef.current.value = ''
            }}
          />
        </label>
      </div>
      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label="Receipts to attach">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center gap-2.5 rounded-lg bg-wn-sand px-3 py-2 text-[13.5px] text-wn-ink"
            >
              {file.type === 'application/pdf' ? (
                <FileText className="size-4 shrink-0 text-wn-stone" aria-hidden />
              ) : (
                <ImageIcon className="size-4 shrink-0 text-wn-stone" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-[12px] tabular-nums text-wn-stone">{sizeText(file.size)}</span>
              <button
                type="button"
                onClick={() => onRemove(index)}
                aria-label={`Remove ${file.name}`}
                className="grid size-8 place-items-center rounded-full text-wn-stone outline-none hover:bg-white hover:text-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {problems.map((problem) => (
        <p key={problem} role="alert" className="text-[12.5px] font-semibold text-red-800">
          {problem}
        </p>
      ))}
    </div>
  )
}
