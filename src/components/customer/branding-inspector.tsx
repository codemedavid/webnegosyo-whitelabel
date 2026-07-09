'use client'

/**
 * Iframe-side inspector for the Branding Studio's click-to-inspect feature.
 *
 * Mounted on storefront pages that the Studio previews. Dormant (no listeners
 * beyond a message subscription, nothing rendered) until the editor posts
 * BRANDING_INSPECT_MODE_MESSAGE from the same origin. While active it
 * outlines the hovered region tagged with data-branding-scope, and a click
 * is swallowed (links/buttons don't fire) and reported to the editor as
 * BRANDING_SCOPE_SELECTED_MESSAGE so the settings panel can jump to that
 * region's configuration. Escape clears the current highlight.
 */

import { useEffect, useRef, useState } from 'react'
import {
  BRANDING_INSPECT_MODE_MESSAGE,
  BRANDING_SCOPE_SELECTED_MESSAGE,
  BRANDING_SCOPE_ATTRIBUTE,
  resolveBrandingScope,
} from '@/lib/branding-inspect'

interface HighlightState {
  scopeKey: string
  label: string
  rect: { top: number; left: number; width: number; height: number }
}

function measure(element: Element): HighlightState['rect'] {
  const rect = element.getBoundingClientRect()
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
}

export function BrandingInspector() {
  const [isActive, setIsActive] = useState(false)
  const [highlight, setHighlight] = useState<HighlightState | null>(null)
  const highlightedElementRef = useRef<Element | null>(null)

  // Editor → iframe: enable/disable inspect mode (same-origin only).
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: unknown; enabled?: unknown } | null
      if (!data || typeof data !== 'object' || data.type !== BRANDING_INSPECT_MODE_MESSAGE) return
      const enabled = data.enabled === true
      setIsActive(enabled)
      if (!enabled) {
        highlightedElementRef.current = null
        setHighlight(null)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Active mode: capture-phase hover/click interception + Escape + re-measure.
  useEffect(() => {
    if (!isActive) return

    const findScopedElement = (target: EventTarget | null): Element | null => {
      if (!(target instanceof Element)) return null
      return target.closest(`[${BRANDING_SCOPE_ATTRIBUTE}]`)
    }

    const handleMouseOver = (event: MouseEvent) => {
      const element = findScopedElement(event.target)
      const scopeKey = element?.getAttribute(BRANDING_SCOPE_ATTRIBUTE) ?? null
      const target = resolveBrandingScope(scopeKey)
      if (!element || !scopeKey || !target) {
        highlightedElementRef.current = null
        setHighlight(null)
        return
      }
      highlightedElementRef.current = element
      setHighlight({ scopeKey, label: target.label, rect: measure(element) })
    }

    const handleClick = (event: MouseEvent) => {
      // Inspect mode owns every click: nothing underneath may navigate/fire.
      event.preventDefault()
      event.stopPropagation()
      const element = findScopedElement(event.target)
      const scopeKey = element?.getAttribute(BRANDING_SCOPE_ATTRIBUTE)
      if (!scopeKey || !resolveBrandingScope(scopeKey)) return
      try {
        window.parent?.postMessage(
          { type: BRANDING_SCOPE_SELECTED_MESSAGE, scope: scopeKey },
          window.location.origin
        )
      } catch {
        // Cross-origin parent (not the editor) — nothing to report to.
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      highlightedElementRef.current = null
      setHighlight(null)
    }

    const remeasure = () => {
      const element = highlightedElementRef.current
      if (!element) return
      setHighlight((prev) => (prev ? { ...prev, rect: measure(element) } : prev))
    }

    document.addEventListener('mouseover', handleMouseOver, true)
    document.addEventListener('click', handleClick, true)
    document.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('scroll', remeasure, true)
    window.addEventListener('resize', remeasure)
    return () => {
      document.removeEventListener('mouseover', handleMouseOver, true)
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('scroll', remeasure, true)
      window.removeEventListener('resize', remeasure)
    }
  }, [isActive])

  if (!isActive || !highlight) return null

  return (
    <div
      data-testid="branding-inspector-highlight"
      aria-hidden="true"
      className="pointer-events-none fixed z-[9999]"
      style={{
        top: highlight.rect.top,
        left: highlight.rect.left,
        width: highlight.rect.width,
        height: highlight.rect.height,
        outline: '2px solid #2A6FDB',
        outlineOffset: 2,
        background: 'rgba(42,111,219,0.08)',
        borderRadius: 6,
      }}
    >
      <span
        className="absolute -top-7 left-0 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-bold text-white shadow"
        style={{ background: '#2A6FDB' }}
      >
        {highlight.label}
      </span>
    </div>
  )
}
