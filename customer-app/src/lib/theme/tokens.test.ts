import { VALID_CONFIG } from '@/fixtures/contract-fixtures'
import type { AppTheme } from '@/lib/contract'
import { buildTokens, contrastRatio, readableOn } from './tokens'

const theme = VALID_CONFIG.theme as AppTheme

describe('contrastRatio', () => {
  it('matches WCAG for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0)
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
  })
})

describe('readableOn', () => {
  it('keeps a preferred colour that already passes AA', () => {
    expect(readableOn('#00704A', '#FFFFFF')).toBe('#FFFFFF')
  })

  it.each(['#FFE600', '#F5F5F5', '#7FDBFF', '#111111', '#0B3D91', '#FF6F61', '#2ECC40', '#B10DC9', '#FFDC00', '#AAAAAA'])(
    'falls back to a legible ink on %s',
    (background) => {
      const ink = readableOn(background, '#FFFFFF')
      expect(contrastRatio(ink, background)).toBeGreaterThanOrEqual(4.5)
    },
  )
})

describe('buildTokens', () => {
  it('maps corner style onto the radius scale', () => {
    expect(buildTokens({ ...theme, corners: 'sharp' }).radius.md).toBeLessThan(buildTokens(theme).radius.md)
    expect(buildTokens(theme).radius.pill).toBe(999)
  })

  it('names the font families for the chosen key', () => {
    const tokens = buildTokens({ ...theme, fontKey: 'poppins' })
    expect(tokens.type.body.fontFamily).toMatch(/Poppins/)
    expect(tokens.type.display.fontFamily).toMatch(/Poppins/)
  })

  it('guarantees legible ink on the primary colour even if the server sent a weak pair', () => {
    const weak = { ...theme, colors: { ...theme.colors, primary: '#FFE600', onPrimary: '#FFFFFF' } }
    const { colors } = buildTokens(weak)
    expect(contrastRatio(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(4.5)
  })
})
