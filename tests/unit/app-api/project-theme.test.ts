import { appThemeSchema } from '@/lib/app-contract'
import { contrastRatio } from '@/lib/color-contrast'

describe('projectAppTheme', () => {
  const load = async () => (await import('@/lib/app-api/project-theme')).projectAppTheme

  const ON_PAIRS = [
    ['onPrimary', 'primary'],
    ['onPrimarySoft', 'primarySoft'],
    ['onAccent', 'accent'],
    ['text', 'background'],
    ['text', 'surface'],
  ] as const

  it('turns a store with no branding into a valid, legible theme', async () => {
    const projectAppTheme = await load()
    const theme = projectAppTheme({})
    expect(appThemeSchema.safeParse(theme).success).toBe(true)
    for (const [ink, paper] of ON_PAIRS) expect(contrastRatio(theme.colors[ink], theme.colors[paper])).toBeGreaterThanOrEqual(4.5)
  })

  it('uses the store button colour as the app primary and its accent as accent', async () => {
    const projectAppTheme = await load()
    const theme = projectAppTheme({ button_primary_color: '#00704A', button_primary_text_color: '#FFFFFF', brand_color: '#CBA258' })
    expect(theme.colors.primary).toBe('#00704a')
    expect(theme.colors.onPrimary).toBe('#ffffff')
    expect(theme.colors.accent).toBe('#cba258')
  })

  it('writes on the accent in plain dark or white ink, never a nudged grey', async () => {
    const projectAppTheme = await load()
    expect(projectAppTheme({ brand_color: '#000000', text_primary_color: '#111827' }).colors.onAccent).toBe('#ffffff')
    expect(projectAppTheme({ brand_color: '#ffd700' }).colors.onAccent).toBe('#111111')
  })

  it('expands #RGB and lowercases, so native colour props always get #rrggbb', async () => {
    const projectAppTheme = await load()
    expect(projectAppTheme({ button_primary_color: '#F0A' }).colors.primary).toBe('#ff00aa')
  })

  it('falls back when a column holds a colour the app cannot use', async () => {
    const projectAppTheme = await load()
    const theme = projectAppTheme({ button_primary_color: 'rgba(0,0,0,0.5)', background_color: 'tomato' })
    expect(appThemeSchema.safeParse(theme).success).toBe(true)
  })

  it.each(['#ffd700', '#ffffff', '#000000', '#e11d48', '#a3e635', '#0ea5e9', '#f59e0b', '#7c3aed', '#14b8a6', '#facc15'])(
    'keeps every on-colour readable for primary %s',
    async (primary) => {
      const projectAppTheme = await load()
      const theme = projectAppTheme({ button_primary_color: primary, button_primary_text_color: primary, brand_color: primary })
      for (const [ink, paper] of ON_PAIRS) expect(contrastRatio(theme.colors[ink], theme.colors[paper])).toBeGreaterThanOrEqual(4.5)
    },
  )

  it.each([
    [undefined, 'jakarta'],
    ['theme', 'jakarta'],
    ['elegant serif', 'fraunces'],
    ['warm editorial', 'fraunces'],
    ['bold display', 'poppins'],
    ['modern sans', 'inter'],
    ['nonsense', 'jakarta'],
  ])('maps font pair %p to %s', async (fontPair, fontKey) => {
    const projectAppTheme = await load()
    expect(projectAppTheme({ font_pair: fontPair }).fontKey).toBe(fontKey)
  })

  it.each([
    [undefined, 'soft'],
    ['theme', 'soft'],
    ['sharp', 'sharp'],
    ['soft', 'soft'],
    ['round', 'round'],
  ])('maps card roundness %p to %s', async (roundness, corners) => {
    const projectAppTheme = await load()
    expect(projectAppTheme({ card_roundness: roundness }).corners).toBe(corners)
  })

  it('keeps muted text visibly lighter than body text, so a placeholder never looks filled in (sample-demo, 2026-11-12)', async () => {
    const projectAppTheme = await load()
    const lifted = projectAppTheme({ text_primary_color: '#000000', text_secondary_color: '#0d0d0d', background_color: '#ffffff' }).colors
    expect(contrastRatio(lifted.textMuted, lifted.text)).toBeGreaterThanOrEqual(1.6)
    expect(contrastRatio(lifted.textMuted, lifted.background)).toBeGreaterThanOrEqual(4.5)
    // A store whose muted grey already differs keeps it.
    expect(projectAppTheme({ text_primary_color: '#111111', text_secondary_color: '#6b7280' }).colors.textMuted).toBe('#6b7280')
  })

  it('only passes an https logo', async () => {
    const projectAppTheme = await load()
    expect(projectAppTheme({ logo_url: 'https://ik.imagekit.io/x/logo.png' }).logoUrl).toBe('https://ik.imagekit.io/x/logo.png')
    expect(projectAppTheme({ logo_url: 'http://insecure.example.com/logo.png' }).logoUrl).toBeNull()
    expect(projectAppTheme({ logo_url: '' }).logoUrl).toBeNull()
  })
})
