'use client'

import Link from 'next/link'
import { ArrowUpRight, Crosshair, Globe, MapPin, Navigation, Settings2, Sparkles, Store, X } from 'lucide-react'
import { isNewClient, type ClientPin, type PinSource } from '@/lib/superadmin/client-map/locate'
import { externalMapsLink, formatClientTenure } from '@/lib/superadmin/client-map/display'
import { getMapsProvider } from '@/lib/maps/provider'
import { ClientLogo } from './client-logo'

const PIN_ACCURACY: Record<PinSource, { label: string; hint: string }> = {
  saved: { label: 'Exact', hint: 'From the store’s saved pickup pin' },
  branch: { label: 'Branch', hint: 'From the store’s first branch pin' },
  address: { label: 'Approximate', hint: 'Located from the typed address' },
}

const joinedFormatter = new Intl.DateTimeFormat('en-PH', { month: 'short', year: 'numeric' })

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5" title={hint}>
      <p className="text-[10px] font-medium uppercase tracking-widest text-white/40">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-white">{value}</p>
    </div>
  )
}

interface ClientDetailCardProps {
  pin: ClientPin
  onClose: () => void
  onRefocus: () => void
}

export function ClientDetailCard({ pin, onClose, onRefocus }: ClientDetailCardProps) {
  const now = new Date()
  const accuracy = PIN_ACCURACY[pin.source]
  const tenure = formatClientTenure(pin.createdAt, now)
  const joined = Number.isFinite(Date.parse(pin.createdAt)) ? joinedFormatter.format(new Date(pin.createdAt)) : '—'
  const mapsLink = externalMapsLink(pin, getMapsProvider())

  return (
    <div
      className="absolute inset-x-3 bottom-3 z-20 animate-in fade-in slide-in-from-bottom-4 duration-300 sm:inset-x-auto sm:bottom-5 sm:left-5 sm:w-[372px]"
    >
      <div className="overflow-hidden rounded-3xl border border-white/15 bg-black/80 shadow-[0_30px_80px_rgba(0,0,0,0.7)] backdrop-blur-2xl">
        <div
          className="relative h-24"
          style={{
            background: `radial-gradient(120% 140% at 15% 0%, color-mix(in srgb, ${pin.color} 70%, transparent), transparent 70%), linear-gradient(180deg, rgba(255,255,255,0.06), transparent)`,
          }}
        >
          <div
            className="absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
              backgroundSize: '18px 18px',
            }}
          />
          <div className="absolute right-3 top-3 flex gap-1.5">
            <button
              type="button"
              onClick={onRefocus}
              aria-label="Fly to this client"
              className="rounded-full border border-white/15 bg-black/50 p-2 text-white/70 backdrop-blur transition-colors hover:bg-black/70 hover:text-white"
            >
              <Crosshair className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-full border border-white/15 bg-black/50 p-2 text-white/70 backdrop-blur transition-colors hover:bg-black/70 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="-mt-11 px-5 pb-5">
          <ClientLogo
            name={pin.name}
            logoUrl={pin.logoUrl}
            color={pin.color}
            size={80}
            className="h-20 w-20 rounded-2xl text-xl shadow-2xl ring-4 ring-black"
          />

          <div className="mt-3 flex items-start justify-between gap-3">
            <h3 className="text-xl font-bold leading-tight tracking-tight text-white">{pin.name}</h3>
            {isNewClient(pin.createdAt, now) ? (
              <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                <Sparkles className="h-3 w-3" /> New
              </span>
            ) : null}
          </div>

          {pin.address ? (
            <p className="mt-1.5 flex gap-1.5 text-sm leading-snug text-white/55">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="line-clamp-2">{pin.address}</span>
            </p>
          ) : null}

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Fact label="Client since" value={joined} hint={tenure ?? undefined} />
            <Fact label="With us" value={tenure ?? '—'} />
            <Fact label="Pin" value={accuracy.label} hint={accuracy.hint} />
          </div>

          {pin.domain || pin.branchCount > 1 ? (
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/60">
              {pin.domain ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1">
                  <Globe className="h-3 w-3" /> {pin.domain}
                </span>
              ) : null}
              {pin.branchCount > 1 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1">
                  <Store className="h-3 w-3" /> {pin.branchCount} branches
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <a
              href={`/${pin.slug}/menu`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-white/90"
            >
              View store <ArrowUpRight className="h-4 w-4" />
            </a>
            <Link
              href={`/superadmin/tenants/${pin.id}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/[0.06]"
            >
              <Settings2 className="h-4 w-4" /> Manage
            </Link>
          </div>
          <a
            href={mapsLink.href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-white/45 transition-colors hover:text-white"
          >
            <Navigation className="h-3 w-3" /> {mapsLink.label}
          </a>
        </div>
      </div>
    </div>
  )
}
