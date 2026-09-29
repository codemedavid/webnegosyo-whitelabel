'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'

import { LIMITS } from '@/lib/hero-builder/constants'
import { sanitizeWidgetHtml } from '@/lib/hero-builder/html-sanitize'
import { buildEmbedDocument, EMBED_MESSAGE_TYPE, EMBED_SANDBOX } from '@/lib/hero-builder/media'

/**
 * "HTML & CSS" block: sanitized markup in a shadow root. The shadow root
 * scopes the merchant's <style> to this block (it cannot restyle the menu or
 * checkout) and the host's CSS containment keeps even position:fixed content
 * inside the block's box.
 */
export function HtmlBlock({ html }: { html: string }) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
    root.innerHTML = `<style>:host{display:block}img,video{max-width:100%;height:auto}</style>${sanitizeWidgetHtml(html)}`
  }, [html])

  return <div ref={hostRef} className="hb-html" />
}

interface EmbedBlockProps {
  code: string
  height: number
  autoHeight: boolean
}

function clampHeight(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(LIMITS.embedMaxHeight, Math.max(40, Math.ceil(value)))
}

/**
 * Embed block: any code, including scripts, inside a sandboxed iframe with an
 * opaque origin. Only a height message from THIS frame's window is honoured.
 */
export function EmbedBlock({ code, height, autoHeight }: EmbedBlockProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const reactId = useId()
  const frameId = useMemo(() => `hbe${reactId.replace(/[^a-zA-Z0-9]/g, '')}`, [reactId])
  const initial = clampHeight(height, 360)
  const [frameHeight, setFrameHeight] = useState(initial)
  const srcDoc = useMemo(() => buildEmbedDocument(code, frameId), [code, frameId])

  useEffect(() => setFrameHeight(initial), [initial])

  useEffect(() => {
    if (!autoHeight) return
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return
      const data = event.data as { type?: unknown; id?: unknown; height?: unknown } | null
      if (!data || data.type !== EMBED_MESSAGE_TYPE || data.id !== frameId) return
      setFrameHeight(Math.max(40, clampHeight(data.height, initial)))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [autoHeight, frameId, initial])

  return (
    <div className="hb-embed">
      <iframe
        ref={frameRef}
        title="Embedded content"
        sandbox={EMBED_SANDBOX}
        srcDoc={srcDoc}
        referrerPolicy="no-referrer"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        loading="lazy"
        style={{ height: frameHeight }}
      />
    </div>
  )
}

const UNITS = [
  { key: 'days', label: 'Days', ms: 86_400_000 },
  { key: 'hours', label: 'Hours', ms: 3_600_000 },
  { key: 'minutes', label: 'Mins', ms: 60_000 },
  { key: 'seconds', label: 'Secs', ms: 1_000 },
] as const

function splitRemaining(ms: number): number[] {
  let rest = Math.max(0, ms)
  return UNITS.map((unit) => {
    const value = Math.floor(rest / unit.ms)
    rest -= value * unit.ms
    return value
  })
}

interface CountdownBlockProps {
  target: string
  showLabels: boolean
  expiredText: string
}

/** Ticks only after mount, so server and client HTML always match. */
export function CountdownBlock({ target, showLabels, expiredText }: CountdownBlockProps) {
  const targetMs = Date.parse(target)
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const remaining = now === null || Number.isNaN(targetMs) ? null : targetMs - now
  if (remaining !== null && remaining <= 0 && expiredText) {
    return <p className="hb-text">{expiredText}</p>
  }
  const values = remaining === null ? null : splitRemaining(remaining)

  return (
    <div className="hb-cd" role="timer" aria-live="off">
      {UNITS.map((unit, i) => (
        <div key={unit.key} className="hb-cd-box">
          <span className="hb-cd-num">{values ? String(values[i]).padStart(2, '0') : '--'}</span>
          {showLabels && <span className="hb-cd-label">{unit.label}</span>}
        </div>
      ))}
    </div>
  )
}
