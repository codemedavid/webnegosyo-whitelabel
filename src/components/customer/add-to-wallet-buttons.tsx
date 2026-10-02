'use client'

import type { WalletAvailability } from '@/lib/loyalty/wallet-pass/config'

/**
 * Wallet artwork lives in `public/wallet/`. The Google badge and icon are
 * Google's official "Add to Google Wallet" assets (enUS). The Apple badge and
 * icon are stand-ins drawn to the same layout: Apple's official badge sits
 * behind a licence click-through, so before launch download it from
 * developer.apple.com/wallet/add-to-apple-wallet-guidelines and save it over
 * `add-to-apple-wallet.svg` / `apple-wallet-icon.svg` — no code change needed.
 */
const WALLET_ART = {
  apple: {
    name: 'Apple Wallet',
    badge: '/wallet/add-to-apple-wallet.svg',
    icon: '/wallet/apple-wallet-icon.svg',
    href: '/api/loyalty/passes/apple',
  },
  google: {
    name: 'Google Wallet',
    badge: '/wallet/add-to-google-wallet.svg',
    icon: '/wallet/google-wallet-icon.svg',
    href: '/api/loyalty/passes/google',
  },
} as const

type WalletKind = keyof typeof WALLET_ART

function availableWallets(wallets: WalletAvailability | null): WalletKind[] {
  if (!wallets) return []
  return (['apple', 'google'] as const).filter((kind) => wallets[kind])
}

interface AddToWalletButtonsProps {
  orderId: string
  tenantId: string
  trackingToken: string
  wallets: WalletAvailability | null
}

/**
 * "Add to Apple Wallet" / "Add to Google Wallet" badges for the stamp card.
 *
 * Plain links, not fetches: iOS Safari only opens the Wallet sheet for a
 * `.pkpass` it navigates to, and the Google route answers with a redirect to
 * Google's own save page. The receipt's tracking token is the proof of
 * ownership — the pass is for the number on THIS order, never a typed one.
 */
export function AddToWalletButtons({ orderId, tenantId, trackingToken, wallets }: AddToWalletButtonsProps) {
  const kinds = availableWallets(wallets)
  if (kinds.length === 0) return null
  const query = new URLSearchParams({ orderId, tenantId, token: trackingToken }).toString()

  return (
    <div className="mx-5 mb-5 rounded-2xl p-4 text-center" style={{ backgroundColor: 'var(--trk-accent-soft)' }} data-testid="add-to-wallet">
      <h3 className="text-sm font-bold" style={{ color: 'var(--trk-text)' }}>
        Save your card to your phone
      </h3>
      <p className="mt-0.5 text-xs" style={{ color: 'var(--trk-text-muted)' }}>
        Tap below — your stamps update by themselves, no app needed.
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {kinds.map((kind) => (
          <a
            key={kind}
            href={`${WALLET_ART[kind].href}?${query}`}
            className="inline-flex rounded-[10px] transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static vendor badge SVG */}
            <img src={WALLET_ART[kind].badge} alt={`Add to ${WALLET_ART[kind].name}`} className="h-11 w-auto" />
          </a>
        ))}
      </div>
    </div>
  )
}

/**
 * Before the stamp is claimed there is no card to save yet, so this only
 * says where the card can go — logos, no links.
 */
export function WalletHint({ wallets }: { wallets: WalletAvailability | null }) {
  const kinds = availableWallets(wallets)
  if (kinds.length === 0) return null
  const names = kinds.map((kind) => WALLET_ART[kind].name).join(' or ')

  return (
    <p data-testid="wallet-hint" className="flex items-center justify-center gap-2 text-[11px]" style={{ color: 'var(--trk-text-muted)' }}>
      <span className="flex shrink-0 items-center gap-1">
        {kinds.map((kind) => (
          // eslint-disable-next-line @next/next/no-img-element -- static vendor icon SVG
          <img key={kind} src={WALLET_ART[kind].icon} alt={WALLET_ART[kind].name} className="h-4 w-auto" />
        ))}
      </span>
      <span>After claiming, add your card to {names}.</span>
    </p>
  )
}
