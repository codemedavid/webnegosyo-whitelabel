'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import type { VoucherPreview } from '@/lib/vouchers/preview'

interface VoucherFieldProps {
  codes: readonly string[]
  preview: VoucherPreview | null
  isChecking: boolean
  onApply: (code: string) => void | Promise<void>
  onRemove: (code: string) => void | Promise<void>
  formatPrice: (amount: number) => string
}

/**
 * The voucher entry, shared by every checkout design.
 *
 * Rejections are shown per code rather than as one banner: with stacking, one
 * code can be accepted while the next is turned down, and "invalid voucher"
 * would not say which.
 */
export function VoucherField({
  codes,
  preview,
  isChecking,
  onApply,
  onRemove,
  formatPrice,
}: VoucherFieldProps) {
  const [draft, setDraft] = useState('')

  const submit = async () => {
    const code = draft.trim()
    if (code === '') return
    setDraft('')
    await onApply(code)
  }

  const acceptedByCode = new Map(preview?.accepted.map((a) => [a.code, a]) ?? [])
  const rejectedByCode = new Map(preview?.rejected.map((r) => [r.code, r]) ?? [])

  return (
    <div className="space-y-2">
      <label htmlFor="voucher-code-input" className="text-sm font-medium">
        Have a voucher?
      </label>

      <div className="flex gap-2">
        <input
          id="voucher-code-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            // Enter must not submit the surrounding checkout form.
            if (e.key !== 'Enter') return
            e.preventDefault()
            void submit()
          }}
          placeholder="Enter code"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 h-10 rounded-md border border-gray-300 px-3 font-mono text-sm uppercase"
          disabled={isChecking}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={isChecking || draft.trim() === ''}
          className="h-10 rounded-md border border-gray-300 px-4 text-sm font-medium disabled:opacity-50"
        >
          {isChecking ? 'Checking…' : 'Apply'}
        </button>
      </div>

      {codes.length > 0 && (
        <ul className="space-y-1">
          {codes.map((code) => {
            const accepted = acceptedByCode.get(code)
            const rejected = rejectedByCode.get(code)

            return (
              <li key={code} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-medium">{code}</span>
                    {accepted && (
                      <span className="text-green-700">−{formatPrice(accepted.amount)}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => void onRemove(code)}
                    aria-label={`Remove voucher ${code}`}
                    className="shrink-0 rounded p-1 text-gray-500 hover:text-gray-900"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {rejected && <p className="text-red-600">{rejected.message}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
