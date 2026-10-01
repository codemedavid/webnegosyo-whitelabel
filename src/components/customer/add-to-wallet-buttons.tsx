'use client'

import { Wallet } from 'lucide-react'
import type { WalletAvailability } from '@/lib/loyalty/wallet-pass/config'

interface AddToWalletButtonsProps {
  orderId: string
  tenantId: string
  trackingToken: string
  wallets: WalletAvailability | null
}

/**
 * "Add to Apple Wallet" / "Add to Google Wallet" for the stamp card.
 *
 * Plain links, not fetches: iOS Safari only opens the Wallet sheet for a
 * `.pkpass` it navigates to, and the Google route answers with a redirect to
 * Google's own save page. The receipt's tracking token is the proof of
 * ownership — the pass is for the number on THIS order, never a typed one.
 *
 * Before launch, swap these for Apple's and Google's official badge artwork —
 * both programmes require it in production.
 */
export function AddToWalletButtons({ orderId, tenantId, trackingToken, wallets }: AddToWalletButtonsProps) {
  if (!wallets || (!wallets.apple && !wallets.google)) return null
  const query = new URLSearchParams({ orderId, tenantId, token: trackingToken }).toString()

  return (
    <div className="px-5 pb-5" data-testid="add-to-wallet">
      <p className="mb-2 text-center text-xs" style={{ color: 'var(--trk-text-muted)' }}>
        Keep your card on your phone — it updates by itself when you earn.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {wallets.apple && (
          <a
            href={`/api/loyalty/passes/apple?${query}`}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-black px-4 text-sm font-semibold text-white"
          >
            <Wallet aria-hidden className="h-4 w-4" />
            Add to Apple Wallet
          </a>
        )}
        {wallets.google && (
          <a
            href={`/api/loyalty/passes/google?${query}`}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-black px-4 text-sm font-semibold text-white"
          >
            <Wallet aria-hidden className="h-4 w-4" />
            Add to Google Wallet
          </a>
        )}
      </div>
    </div>
  )
}
