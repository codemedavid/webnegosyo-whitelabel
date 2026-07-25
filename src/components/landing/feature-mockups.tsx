'use client'

import { Check, Plus } from 'lucide-react'
import { LANDING_COLORS, type JourneyMock } from './landing-theme'

const CARD_BG = '#141210'
const SURFACE_BG = '#1c1815'

function MockShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="w-full max-w-sm overflow-hidden rounded-[1.75rem] border border-white/10 p-4 shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
      style={{ backgroundColor: CARD_BG }}
      aria-hidden
    >
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">
          {label}
        </span>
      </div>
      {children}
    </div>
  )
}

function Thumb({ emoji, className = '' }: { emoji: string; className?: string }) {
  return (
    <span
      className={`flex items-center justify-center rounded-xl text-2xl ${className}`}
      style={{ background: `linear-gradient(140deg, ${LANDING_COLORS.brand}26, ${SURFACE_BG})` }}
    >
      {emoji}
    </span>
  )
}

function PairingMock() {
  const suggestions = [
    { emoji: '🍟', name: 'Regular Fries', price: '₱59' },
    { emoji: '🥤', name: 'Iced Tea 16oz', price: '₱45' },
  ]

  return (
    <MockShell label="Pagkatapos mag-add to cart">
      <div className="rounded-2xl p-4" style={{ backgroundColor: SURFACE_BG }}>
        <p className="text-[13px] font-black text-white">Perfect with Cheeseburger</p>
        <p className="mt-0.5 text-[11px] text-white/40">Complete your order</p>

        <div className="mt-3 space-y-2">
          {suggestions.map((item) => (
            <div
              key={item.name}
              className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/30 p-2.5"
            >
              <Thumb emoji={item.emoji} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-bold text-white">{item.name}</p>
                <p className="text-[11px] text-white/40">{item.price}</p>
              </div>
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full"
                style={{ backgroundColor: LANDING_COLORS.brand }}
              >
                <Plus className="h-3.5 w-3.5 text-white" />
              </span>
            </div>
          ))}
        </div>
      </div>
    </MockShell>
  )
}

function UpgradeMock() {
  return (
    <MockShell label="Sa product page">
      <p className="px-1 text-[13px] font-black text-white">Make it a meal?</p>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl border border-white/10 p-3" style={{ backgroundColor: SURFACE_BG }}>
          <Thumb emoji="🍔" className="h-16 w-full" />
          <p className="mt-2.5 text-[11px] font-bold text-white/80">Ala Carte</p>
          <p className="text-[11px] text-white/40">₱149</p>
        </div>
        <div
          className="relative rounded-2xl border-2 p-3"
          style={{ backgroundColor: SURFACE_BG, borderColor: '#22c55e' }}
        >
          <span className="absolute -top-2 right-2 rounded-full bg-green-500 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
            +₱89
          </span>
          <Thumb emoji="🍔🍟" className="h-16 w-full" />
          <p className="mt-2.5 flex items-center gap-1 text-[11px] font-bold text-white">
            <Check className="h-3 w-3 text-green-500" />
            Meal
          </p>
          <p className="text-[11px] text-white/40">₱238</p>
        </div>
      </div>
      <div
        className="mt-3 rounded-full py-2.5 text-center text-[11px] font-black uppercase tracking-[0.1em] text-white"
        style={{
          background: `linear-gradient(135deg, ${LANDING_COLORS.brand}, ${LANDING_COLORS.brandDeep})`,
        }}
      >
        Add to cart — ₱238
      </div>
    </MockShell>
  )
}

function BundleMock() {
  return (
    <MockShell label="Sa taas ng menu">
      <div
        className="relative overflow-hidden rounded-2xl border border-white/10 p-4"
        style={{ backgroundColor: SURFACE_BG }}
      >
        <span className="absolute right-3 top-3 rounded-full bg-green-500/15 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-green-400">
          Save ₱120
        </span>
        <p className="pr-20 text-[13px] font-black text-white">Barkada Bundle</p>
        <p className="mt-0.5 text-[11px] text-white/40">4 items · para sa 3–4 tao</p>

        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {['🍗', '🍚', '🥤', '🍰'].map((emoji) => (
            <Thumb key={emoji} emoji={emoji} className="h-12 w-full text-xl" />
          ))}
        </div>

        <div className="mt-3.5 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-black text-white">₱699</span>
            <span className="text-[11px] text-white/30 line-through">₱819</span>
          </div>
          <span
            className="rounded-full px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-white"
            style={{ backgroundColor: LANDING_COLORS.brand }}
          >
            Add bundle
          </span>
        </div>
      </div>
    </MockShell>
  )
}

const MOCKS: Record<JourneyMock, () => React.JSX.Element> = {
  pairing: PairingMock,
  upgrade: UpgradeMock,
  bundle: BundleMock,
}

export function FeatureMock({ variant }: { variant: JourneyMock }) {
  const Mock = MOCKS[variant]
  return <Mock />
}
