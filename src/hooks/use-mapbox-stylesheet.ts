'use client'

import { useEffect } from 'react'

/** Stylesheet for the mapbox-gl map picker; loaded on demand, never globally. */
export const MAPBOX_GL_CSS_HREF = 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css'

const LINK_ID = 'mapbox-gl-css'

function hasMapboxStylesheet(): boolean {
  return Boolean(document.getElementById(LINK_ID)) ||
    Boolean(document.head.querySelector(`link[href="${MAPBOX_GL_CSS_HREF}"]`))
}

/**
 * Append the mapbox-gl stylesheet to <head> once, on mount.
 *
 * mapbox-gl.css used to sit in the root layout, render-blocking every guest
 * page although only the address picker (admin forms + checkout) draws a map.
 * Injecting it from the consumer keeps the guest menu free of it. Idempotent:
 * several mounted pickers share a single <link>, which is left in place on
 * unmount because the CSS is harmless and removing it would flash the next map.
 */
export function useMapboxStylesheet(enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled || typeof document === 'undefined' || hasMapboxStylesheet()) return

    const link = document.createElement('link')
    link.id = LINK_ID
    link.rel = 'stylesheet'
    link.href = MAPBOX_GL_CSS_HREF
    document.head.appendChild(link)
  }, [enabled])
}
