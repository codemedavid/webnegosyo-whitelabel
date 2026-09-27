'use client'

import { useCallback, useMemo, useState } from 'react'
import { AlertTriangle, Maximize2 } from 'lucide-react'
// Route-scoped: only this page pulls the stylesheet, at the installed version.
import 'mapbox-gl/dist/mapbox-gl.css'
import type { ClientMapData } from '@/lib/queries/client-map-server'
import { ClientDetailCard } from './client-detail-card'
import { ClientList } from './client-list'
import { useClientMap } from './use-client-map'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? ''

function Legend() {
  return (
    <div className="pointer-events-none absolute left-4 top-4 z-10 hidden items-center gap-4 rounded-full border border-white/10 bg-black/60 px-4 py-2 text-[11px] text-white/60 backdrop-blur-md sm:flex">
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white" /> Exact pin
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full border border-dashed border-white/70" /> Approximate
      </span>
      <span className="flex items-center gap-1.5">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
          <span className="relative h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </span>
        Joined in 30 days
      </span>
    </div>
  )
}

function LoadingVeil({ count }: { count: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-16 w-16">
          <span className="absolute inset-0 animate-ping rounded-full border border-white/30" />
          <span className="absolute inset-3 rounded-full border border-white/40" />
          <span className="absolute inset-[26px] rounded-full bg-white" />
        </div>
        <p className="text-sm text-white/55">Plotting {count} clients…</p>
      </div>
    </div>
  )
}

export function ClientMapExplorer({ data }: { data: ClientMapData }) {
  const { pins, unmapped, isGeocodingDegraded } = data
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const pinsById = useMemo(() => new Map(pins.map((pin) => [pin.id, pin])), [pins])
  const selectedPin = selectedId ? pinsById.get(selectedId) ?? null : null

  const { containerRef, isReady, error, flyToPin, resetView } = useClientMap({
    pins,
    selectedId,
    // Marker clicks fly inside the hook; the explorer only records the selection.
    onSelect: setSelectedId,
    accessToken: MAPBOX_TOKEN,
  })

  const selectAndFly = useCallback(
    (id: string) => {
      const pin = pinsById.get(id)
      if (!pin) return
      setSelectedId(id)
      flyToPin(pin)
    },
    [pinsById, flyToPin],
  )

  const handleReset = useCallback(() => {
    setSelectedId(null)
    resetView()
  }, [resetView])

  const mapError = !MAPBOX_TOKEN ? 'Mapbox is not configured (NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN).' : error

  return (
    <div className="space-y-3">
      {isGeocodingDegraded ? (
        <p className="flex items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Address lookup is unavailable right now — only clients with saved pins are shown. Refresh to retry.
        </p>
      ) : null}

      <div className="grid gap-4 lg:h-[calc(100dvh-15rem)] lg:min-h-[620px] lg:grid-cols-[340px_minmax(0,1fr)]">
        <ClientList
          pins={pins}
          unmapped={unmapped}
          selectedId={selectedId}
          onSelect={selectAndFly}
          className="order-2 h-[520px] lg:order-1 lg:h-auto"
        />

        <div className="relative order-1 h-[64vh] min-h-[460px] overflow-hidden rounded-3xl border border-white/10 bg-black shadow-[0_0_80px_rgba(255,255,255,0.04)] lg:order-2 lg:h-auto">
          {/* mapbox-gl adds `.mapboxgl-map { position: relative }` to the element it
              owns, which would override `absolute inset-0` and collapse it to 0px tall.
              The frame fills the card; the map fills the frame. */}
          <div className="absolute inset-0">
            <div ref={containerRef} className="h-full w-full" />
          </div>

          <div className="pointer-events-none absolute inset-0 z-[1] rounded-3xl shadow-[inset_0_0_120px_rgba(0,0,0,0.75)]" />

          {mapError ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black p-6 text-center text-sm text-white/60">
              {mapError}
            </div>
          ) : !isReady ? (
            <LoadingVeil count={pins.length} />
          ) : null}

          <Legend />

          <button
            type="button"
            onClick={handleReset}
            className="absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-3.5 py-2 text-xs font-medium text-white/80 backdrop-blur-md transition-colors hover:bg-black/80 hover:text-white"
          >
            <Maximize2 className="h-3.5 w-3.5" /> Show all
          </button>

          {selectedPin ? (
            <ClientDetailCard
              key={selectedPin.id}
              pin={selectedPin}
              onClose={() => setSelectedId(null)}
              onRefocus={() => flyToPin(selectedPin)}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
