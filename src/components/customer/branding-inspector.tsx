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
  BRANDING_SELECT_MESSAGE,
  BRANDING_FIELD_HOVER_MESSAGE,
  resolveBrandingScope,
} from '@/lib/branding-inspect'
import { componentsUsingField } from '@/lib/branding-components'
import type { BrandingSurface } from '@/lib/branding-registry'

/** Enough outlines to show a setting's reach without flooding a long menu. */
const MAX_FIELD_HOVER_OUTLINES = 40
const SELECTION_COLOR = '#2A6FDB'

type Rect = { top: number; left: number; width: number; height: number }

interface FieldHover {
  surfaceId: BrandingSurface['id']
  fieldId: string
}

function scopeSelector(scope: string): string {
  return `[${BRANDING_SCOPE_ATTRIBUTE}="${CSS.escape(scope)}"]`
}

/** Outlines for the selected component and for the setting under the owner's pointer. */
function useStudioOutlines(selectedScope: string | null, fieldHover: FieldHover | null) {
  const [selection, setSelection] = useState<{ label: string; rect: Rect } | null>(null)
  const [fieldRects, setFieldRects] = useState<Rect[]>([])

  useEffect(() => {
    if (!selectedScope && !fieldHover) {
      // Dormant (every real diner): no work, no listeners, no re-render.
      setSelection((prev) => (prev ? null : prev))
      setFieldRects((prev) => (prev.length ? [] : prev))
      return
    }
    let frame = 0
    const measureAll = () => {
      const target = selectedScope ? resolveBrandingScope(selectedScope) : null
      const element = target && selectedScope ? document.querySelector(scopeSelector(selectedScope)) : null
      setSelection(element && target ? { label: target.label, rect: measure(element) } : null)

      const scopes = fieldHover ? componentsUsingField(fieldHover.surfaceId, fieldHover.fieldId) : []
      const elements = scopes.flatMap((scope) => Array.from(document.querySelectorAll(scopeSelector(scope))))
      setFieldRects(elements.slice(0, MAX_FIELD_HOVER_OUTLINES).map(measure))
    }
    // One measure per frame; re-measure when the page lays out again (a draft
    // edit, a late-mounting element, navigation inside the preview).
    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        measureAll()
      })
    }
    measureAll()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    observer?.observe(document.body)
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(schedule)
    mutations?.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      observer?.disconnect()
      mutations?.disconnect()
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [selectedScope, fieldHover])

  return { selection, fieldRects }
}

interface HighlightState {
  scopeKey: string
  label: string
  rect: Rect
}

function measure(element: Element): Rect {
  const rect = element.getBoundingClientRect()
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
}

export function BrandingInspector() {
  const [isActive, setIsActive] = useState(false)
  const [selectedScope, setSelectedScope] = useState<string | null>(null)
  const [fieldHover, setFieldHover] = useState<FieldHover | null>(null)
  const { selection, fieldRects } = useStudioOutlines(selectedScope, fieldHover)
  const [highlight, setHighlight] = useState<HighlightState | null>(null)
  const highlightedElementRef = useRef<Element | null>(null)

  // Editor → iframe: enable/disable inspect mode (same-origin only).
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: unknown; enabled?: unknown; scope?: unknown; surfaceId?: unknown; fieldId?: unknown } | null
      if (!data || typeof data !== 'object') return
      if (data.type === BRANDING_SELECT_MESSAGE) {
        setSelectedScope(typeof data.scope === 'string' && resolveBrandingScope(data.scope) ? data.scope : null)
        return
      }
      if (data.type === BRANDING_FIELD_HOVER_MESSAGE) {
        setFieldHover(typeof data.fieldId === 'string' && typeof data.surfaceId === 'string'
          ? { surfaceId: data.surfaceId as BrandingSurface['id'], fieldId: data.fieldId }
          : null)
        return
      }
      if (data.type !== BRANDING_INSPECT_MODE_MESSAGE) return
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

  const studioOutlines = (
    <>
      {selection && (
        <div
          data-testid="branding-inspector-selection"
          aria-hidden="true"
          className="pointer-events-none fixed z-[9998]"
          style={{ ...selection.rect, outline: `2px solid ${SELECTION_COLOR}`, outlineOffset: 2, borderRadius: 6 }}
        >
          <span
            className="absolute -top-7 left-0 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-bold text-white shadow"
            style={{ background: SELECTION_COLOR }}
          >
            {selection.label}
          </span>
        </div>
      )}
      {fieldRects.map((rect, index) => (
        <div
          key={index}
          data-testid="branding-inspector-field-hover"
          aria-hidden="true"
          className="pointer-events-none fixed z-[9997]"
          style={{ ...rect, outline: `2px dashed ${SELECTION_COLOR}`, outlineOffset: 2, borderRadius: 6, background: 'rgba(42,111,219,0.06)' }}
        />
      ))}
    </>
  )

  if (!isActive || !highlight) return studioOutlines

  return (
    <>
    {studioOutlines}
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
    </>
  )
}
