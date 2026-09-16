/**
 * mapbox-gl.css used to be a render-blocking <link> in the ROOT layout, paid
 * by every guest menu visit although only the Mapbox address picker (admin
 * forms + checkout) needs it. The stylesheet is now injected on demand by the
 * component that uses it.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { renderHook } from '@testing-library/react'
import { useMapboxStylesheet, MAPBOX_GL_CSS_HREF } from '@/hooks/use-mapbox-stylesheet'

function mapboxLinks(): HTMLLinkElement[] {
  return Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).filter(
    (link) => link.href.includes('mapbox-gl.css'),
  )
}

describe('useMapboxStylesheet', () => {
  afterEach(() => {
    mapboxLinks().forEach((link) => link.remove())
  })

  it('appends the mapbox-gl stylesheet to <head> once on mount', () => {
    renderHook(() => useMapboxStylesheet(true))

    const links = mapboxLinks()
    expect(links).toHaveLength(1)
    expect(links[0].href).toBe(MAPBOX_GL_CSS_HREF)
  })

  it('is idempotent across multiple mounted consumers', () => {
    renderHook(() => useMapboxStylesheet(true))
    renderHook(() => useMapboxStylesheet(true))

    expect(mapboxLinks()).toHaveLength(1)
  })

  it('does nothing when disabled', () => {
    renderHook(() => useMapboxStylesheet(false))

    expect(mapboxLinks()).toHaveLength(0)
  })
})

describe('root layout', () => {
  it('no longer ships mapbox-gl.css to every page', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8')
    expect(source).not.toContain('mapbox-gl.css')
  })
})
