'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { MapPinOff, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isNewClient, type ClientPin, type UnmappedClient } from '@/lib/superadmin/client-map/locate'
import { shortLocality } from '@/lib/superadmin/client-map/display'
import { ClientLogo } from './client-logo'

type ListTab = 'mapped' | 'unmapped'

const UNMAPPED_REASON: Record<UnmappedClient['reason'], string> = {
  no_address: 'No address on file',
  address_not_found: 'Address couldn’t be located',
}

function matches(client: { name: string; slug: string; address: string | null }, term: string): boolean {
  if (!term) return true
  return [client.name, client.slug, client.address ?? ''].some((value) => value.toLowerCase().includes(term))
}

interface ClientListProps {
  pins: ClientPin[]
  unmapped: UnmappedClient[]
  selectedId: string | null
  onSelect: (id: string) => void
  className?: string
}

export function ClientList({ pins, unmapped, selectedId, onSelect, className }: ClientListProps) {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<ListTab>('mapped')
  const selectedRowRef = useRef<HTMLButtonElement>(null)
  const now = useMemo(() => new Date(), [])
  const term = query.trim().toLowerCase()

  const visiblePins = useMemo(
    () => [...pins].filter((pin) => matches(pin, term)).sort((a, b) => a.name.localeCompare(b.name)),
    [pins, term],
  )
  const visibleUnmapped = useMemo(() => unmapped.filter((client) => matches(client, term)), [unmapped, term])

  useEffect(() => {
    if (!selectedId) return
    setTab('mapped')
    selectedRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedId])

  const tabs: Array<{ key: ListTab; label: string; count: number }> = [
    { key: 'mapped', label: 'On the map', count: visiblePins.length },
    { key: 'unmapped', label: 'Not pinned', count: visibleUnmapped.length },
  ]

  return (
    <div className={cn('flex min-h-0 flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02]', className)}>
      <div className="space-y-3 border-b border-white/10 p-4">
        <label className="relative block">
          <span className="sr-only">Search clients</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search clients or cities…"
            className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-3 text-sm text-white placeholder:text-white/35 outline-none transition-colors focus:border-white/30 focus:bg-white/[0.06]"
          />
        </label>
        <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-white/[0.04] p-1">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                tab === item.key ? 'bg-white text-black' : 'text-white/55 hover:text-white',
              )}
            >
              {item.label} <span className="tabular-nums opacity-60">{item.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tab === 'mapped' ? (
          visiblePins.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-white/40">No clients match “{query}”.</p>
          ) : (
            <ul className="space-y-0.5">
              {visiblePins.map((pin) => {
                const isSelected = pin.id === selectedId
                return (
                  <li key={pin.id}>
                    <button
                      ref={isSelected ? selectedRowRef : undefined}
                      type="button"
                      onClick={() => onSelect(pin.id)}
                      aria-current={isSelected ? 'true' : undefined}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors',
                        isSelected ? 'bg-white/10 ring-1 ring-white/20' : 'hover:bg-white/[0.05]',
                      )}
                    >
                      <span className="relative">
                        <ClientLogo
                          name={pin.name}
                          logoUrl={pin.logoUrl}
                          color={pin.color}
                          size={40}
                          className="h-10 w-10 rounded-full text-xs ring-1 ring-white/10"
                        />
                        <span
                          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-black"
                          style={{ background: pin.color }}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-white">{pin.name}</span>
                          {isNewClient(pin.createdAt, now) ? (
                            <span className="shrink-0 rounded-full bg-emerald-400/15 px-1.5 py-px text-[10px] font-semibold text-emerald-300">
                              NEW
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-xs text-white/45">
                          {shortLocality(pin.address) ?? pin.slug}
                        </span>
                      </span>
                      {pin.source === 'address' ? (
                        <span className="shrink-0 text-[10px] uppercase tracking-wider text-white/30" title="Approximate pin">
                          ≈
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          )
        ) : visibleUnmapped.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-white/40">Every client is on the map.</p>
        ) : (
          <ul className="space-y-0.5">
            {visibleUnmapped.map((client) => (
              <li key={client.id}>
                <Link
                  href={`/superadmin/tenants/${client.id}`}
                  className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-white/[0.05]"
                >
                  <ClientLogo
                    name={client.name}
                    logoUrl={client.logoUrl}
                    color={client.color}
                    size={40}
                    className="h-10 w-10 rounded-full text-xs opacity-70 ring-1 ring-white/10"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white/85">{client.name}</span>
                    <span className="flex items-center gap-1 text-xs text-white/40">
                      <MapPinOff className="h-3 w-3" /> {UNMAPPED_REASON[client.reason]}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
