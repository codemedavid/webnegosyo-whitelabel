'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Monitor, Tablet, Smartphone } from 'lucide-react'
import { HeroRenderer } from '@/components/customer/hero-renderer'
import type { HeroDesign } from '@/types/hero-designer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PreviewModalProps {
  design: HeroDesign
  isOpen: boolean
  onClose: () => void
}

interface DeviceOption {
  id: 'desktop' | 'tablet' | 'mobile'
  label: string
  icon: typeof Monitor
  width: number
}

const DEVICES: DeviceOption[] = [
  { id: 'desktop', label: 'Desktop', icon: Monitor, width: 1440 },
  { id: 'tablet', label: 'Tablet', icon: Tablet, width: 768 },
  { id: 'mobile', label: 'Mobile', icon: Smartphone, width: 390 },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PreviewModal({ design, isOpen, onClose }: PreviewModalProps) {
  const [activeDevice, setActiveDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')

  // Escape key closes the modal
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    },
    [onClose]
  )

  useEffect(() => {
    if (!isOpen) return

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  const device = DEVICES.find((d) => d.id === activeDevice)!
  const desktopHeight = design.canvas.desktop.height
  const mobileHeight = design.canvas.mobile.height
  const displayHeight =
    activeDevice === 'mobile' ? mobileHeight : desktopHeight

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="h-14 flex items-center px-4 bg-zinc-900 border-b border-zinc-700 shrink-0">
        {/* Close button */}
        <button
          onClick={onClose}
          className="text-white hover:text-zinc-300 transition-colors p-1.5 rounded-md hover:bg-zinc-800"
          aria-label="Close preview"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Title */}
        <span className="text-white font-medium ml-3 mr-auto">Preview</span>

        {/* Device toggle */}
        <div className="flex items-center gap-1 mr-4">
          {DEVICES.map((d) => {
            const Icon = d.icon
            const isActive = d.id === activeDevice
            return (
              <button
                key={d.id}
                onClick={() => setActiveDevice(d.id)}
                className={`p-2 rounded-md transition-colors ${
                  isActive
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
                aria-label={d.label}
                title={d.label}
              >
                <Icon className="h-4 w-4" />
              </button>
            )
          })}
        </div>

        {/* Dimensions display */}
        <span className="text-zinc-400 text-sm tabular-nums">
          {device.width} x {displayHeight}px
        </span>
      </div>

      {/* ── Preview area ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-8">
        <div
          className="overflow-hidden rounded-lg border border-zinc-700 bg-white"
          style={{
            width: device.width,
            maxWidth: '100%',
          }}
        >
          <HeroRenderer design={design} />
        </div>
      </div>
    </div>
  )
}
