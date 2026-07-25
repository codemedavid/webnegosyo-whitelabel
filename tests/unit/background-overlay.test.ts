import { describe, it, expect } from '@jest/globals'
import {
  resolveBackgroundOverlay,
  buildBackgroundImageStyle,
  buildBackgroundOverlayStyle,
  DEFAULT_BACKGROUND_OVERLAY,
  BACKGROUND_OVERLAY_COLUMNS,
} from '@/lib/background-overlay'

describe('resolveBackgroundOverlay', () => {
  it('returns the invisible default for a null tenant', () => {
    // Arrange / Act
    const bg = resolveBackgroundOverlay(null)

    // Assert
    expect(bg).toEqual(DEFAULT_BACKGROUND_OVERLAY)
    expect(bg.isVisible).toBe(false)
  })

  it('stays invisible for a tenant with no background fields set', () => {
    const bg = resolveBackgroundOverlay({ id: 't1', background_color: '#ffffff' })

    expect(bg.isVisible).toBe(false)
    expect(bg.hasImage).toBe(false)
    expect(bg.hasOverlay).toBe(false)
  })

  it('enables the image layer with sensible defaults when only a URL is set', () => {
    const bg = resolveBackgroundOverlay({ background_image_url: 'https://cdn.example.com/bg.jpg' })

    expect(bg.hasImage).toBe(true)
    expect(bg.isVisible).toBe(true)
    expect(bg.imageUrl).toBe('https://cdn.example.com/bg.jpg')
    expect(bg.imageOpacity).toBe(1)
    expect(bg.imageSize).toBe('cover')
    expect(bg.imageRepeat).toBe('no-repeat')
    expect(bg.imagePosition).toBe('center')
    expect(bg.imageAttachment).toBe('scroll')
  })

  it('accepts a site-relative image path', () => {
    const bg = resolveBackgroundOverlay({ background_image_url: '/uploads/bg.png' })

    expect(bg.hasImage).toBe(true)
    expect(bg.imageUrl).toBe('/uploads/bg.png')
  })

  it('rejects a javascript: image URL', () => {
    const bg = resolveBackgroundOverlay({ background_image_url: 'javascript:alert(1)' })

    expect(bg.hasImage).toBe(false)
    expect(bg.imageUrl).toBeNull()
  })

  it('rejects an image URL containing CSS-breaking characters', () => {
    const bg = resolveBackgroundOverlay({
      background_image_url: 'https://cdn.example.com/a.jpg") ; background: red; x("',
    })

    expect(bg.hasImage).toBe(false)
    expect(bg.imageUrl).toBeNull()
  })

  it('converts image opacity percent to a 0..1 fraction', () => {
    const bg = resolveBackgroundOverlay({
      background_image_url: 'https://cdn.example.com/bg.jpg',
      background_image_opacity: 40,
    })

    expect(bg.imageOpacity).toBe(0.4)
  })

  it('clamps out-of-range image opacity into 0..1', () => {
    const tooHigh = resolveBackgroundOverlay({
      background_image_url: 'https://cdn.example.com/bg.jpg',
      background_image_opacity: 150,
    })
    const tooLow = resolveBackgroundOverlay({
      background_image_url: 'https://cdn.example.com/bg.jpg',
      background_image_opacity: -20,
    })

    expect(tooHigh.imageOpacity).toBe(1)
    expect(tooLow.imageOpacity).toBe(0)
  })

  it('parses a numeric-string opacity and falls back on garbage', () => {
    const asString = resolveBackgroundOverlay({
      background_image_url: 'https://cdn.example.com/bg.jpg',
      background_image_opacity: '60',
    })
    const garbage = resolveBackgroundOverlay({
      background_image_url: 'https://cdn.example.com/bg.jpg',
      background_image_opacity: 'very transparent',
    })

    expect(asString.imageOpacity).toBe(0.6)
    expect(garbage.imageOpacity).toBe(1)
  })

  it('maps the repeat fit to a tiled background', () => {
    const bg = resolveBackgroundOverlay({
      background_image_url: 'https://cdn.example.com/tile.png',
      background_image_fit: 'repeat',
    })

    expect(bg.imageSize).toBe('auto')
    expect(bg.imageRepeat).toBe('repeat')
  })

  it('maps the contain fit without tiling', () => {
    const bg = resolveBackgroundOverlay({
      background_image_url: 'https://cdn.example.com/tile.png',
      background_image_fit: 'contain',
    })

    expect(bg.imageSize).toBe('contain')
    expect(bg.imageRepeat).toBe('no-repeat')
  })

  it('falls back to cover for an unknown fit value', () => {
    const bg = resolveBackgroundOverlay({
      background_image_url: 'https://cdn.example.com/tile.png',
      background_image_fit: 'stretch-please',
    })

    expect(bg.imageSize).toBe('cover')
  })

  it('honours a fixed (parallax) attachment and a top position', () => {
    const bg = resolveBackgroundOverlay({
      background_image_url: 'https://cdn.example.com/bg.jpg',
      background_image_attachment: 'fixed',
      background_image_position: 'top',
    })

    expect(bg.imageAttachment).toBe('fixed')
    expect(bg.imagePosition).toBe('top')
  })

  it('ignores unknown position and attachment values', () => {
    const bg = resolveBackgroundOverlay({
      background_image_url: 'https://cdn.example.com/bg.jpg',
      background_image_attachment: 'sideways',
      background_image_position: 'diagonal',
    })

    expect(bg.imageAttachment).toBe('scroll')
    expect(bg.imagePosition).toBe('center')
  })

  it('enables the overlay when a tint opacity is set', () => {
    const bg = resolveBackgroundOverlay({
      background_image_url: 'https://cdn.example.com/bg.jpg',
      background_overlay_color: '#112233',
      background_overlay_opacity: 50,
    })

    expect(bg.hasOverlay).toBe(true)
    expect(bg.overlayColor).toBe('#112233')
    expect(bg.overlayOpacity).toBe(0.5)
  })

  it('treats a zero overlay opacity as no overlay layer', () => {
    const bg = resolveBackgroundOverlay({
      background_image_url: 'https://cdn.example.com/bg.jpg',
      background_overlay_color: '#000000',
      background_overlay_opacity: 0,
    })

    expect(bg.hasOverlay).toBe(false)
  })

  it('allows an overlay tint with no image at all', () => {
    const bg = resolveBackgroundOverlay({
      background_overlay_color: '#ff0000',
      background_overlay_opacity: 25,
    })

    expect(bg.hasImage).toBe(false)
    expect(bg.hasOverlay).toBe(true)
    expect(bg.isVisible).toBe(true)
  })

  it('falls back to black for an invalid overlay color', () => {
    const bg = resolveBackgroundOverlay({
      background_overlay_color: 'red; background: url(evil)',
      background_overlay_opacity: 30,
    })

    expect(bg.overlayColor).toBe(DEFAULT_BACKGROUND_OVERLAY.overlayColor)
    expect(bg.hasOverlay).toBe(true)
  })
})

describe('buildBackgroundImageStyle', () => {
  it('returns an empty style object when there is no image', () => {
    const style = buildBackgroundImageStyle(resolveBackgroundOverlay(null))

    expect(style).toEqual({})
  })

  it('builds a quoted url() with the resolved fit, position and opacity', () => {
    const bg = resolveBackgroundOverlay({
      background_image_url: 'https://cdn.example.com/bg.jpg',
      background_image_opacity: 60,
      background_image_fit: 'contain',
      background_image_position: 'bottom',
      background_image_attachment: 'fixed',
    })

    const style = buildBackgroundImageStyle(bg)

    expect(style.backgroundImage).toBe('url("https://cdn.example.com/bg.jpg")')
    expect(style.backgroundSize).toBe('contain')
    expect(style.backgroundPosition).toBe('bottom')
    expect(style.backgroundRepeat).toBe('no-repeat')
    expect(style.backgroundAttachment).toBe('fixed')
    expect(style.opacity).toBe(0.6)
  })
})

describe('buildBackgroundOverlayStyle', () => {
  it('returns an empty style object when there is no overlay', () => {
    const style = buildBackgroundOverlayStyle(resolveBackgroundOverlay(null))

    expect(style).toEqual({})
  })

  it('builds an rgba() tint from the overlay color and opacity', () => {
    const bg = resolveBackgroundOverlay({
      background_overlay_color: '#112233',
      background_overlay_opacity: 50,
    })

    expect(buildBackgroundOverlayStyle(bg).backgroundColor).toBe('rgba(17, 34, 51, 0.5)')
  })

  it('expands a 3-digit hex overlay color', () => {
    const bg = resolveBackgroundOverlay({
      background_overlay_color: '#123',
      background_overlay_opacity: 100,
    })

    expect(buildBackgroundOverlayStyle(bg).backgroundColor).toBe('rgba(17, 34, 51, 1)')
  })
})

describe('BACKGROUND_OVERLAY_COLUMNS', () => {
  it('lists every tenant column the feature reads', () => {
    expect([...BACKGROUND_OVERLAY_COLUMNS]).toEqual([
      'background_image_url',
      'background_image_opacity',
      'background_image_fit',
      'background_image_position',
      'background_image_attachment',
      'background_overlay_color',
      'background_overlay_opacity',
    ])
  })
})
