import { parseMarkup } from '@/lib/hero-builder/text-markup'

describe('parseMarkup', () => {
  it('returns no tokens for empty or non-string input', () => {
    expect(parseMarkup('')).toEqual([])
    expect(parseMarkup(null)).toEqual([])
    expect(parseMarkup(42)).toEqual([])
  })

  it('tokenises bold, italic, links and line breaks', () => {
    // Act
    const tokens = parseMarkup('Hi **bold** and *it*\nsee [menu](#storefront-menu) or [site](https://x.com)')

    // Assert
    expect(tokens).toEqual([
      { type: 'text', text: 'Hi ' },
      { type: 'bold', text: 'bold' },
      { type: 'text', text: ' and ' },
      { type: 'italic', text: 'it' },
      { type: 'break' },
      { type: 'text', text: 'see ' },
      { type: 'link', text: 'menu', href: '#storefront-menu' },
      { type: 'text', text: ' or ' },
      { type: 'link', text: 'site', href: 'https://x.com/' },
    ])
  })

  it.each(['javascript:alert`1`', 'JaVaScRiPt:void0', 'data:text/html,x', '//evil.com', 'vbscript:x'])(
    'renders an unsafe link %p as plain text (label only)',
    (href) => {
      expect(parseMarkup(`[click](${href})`)).toEqual([{ type: 'text', text: 'click' }])
    },
  )

  it('never emits a link token when a javascript: URL contains parentheses', () => {
    const tokens = parseMarkup('[click](javascript:alert(1))')

    expect(tokens.some((t) => t.type === 'link')).toBe(false)
    expect(tokens.map((t) => ('text' in t ? t.text : '')).join('')).toBe('click)')
  })

  it('never produces HTML — tags stay literal text', () => {
    const tokens = parseMarkup('<img src=x onerror=alert(1)> **<b>x</b>**')

    expect(tokens).toEqual([
      { type: 'text', text: '<img src=x onerror=alert(1)> ' },
      { type: 'bold', text: '<b>x</b>' },
    ])
  })

  it('leaves unbalanced markers as text', () => {
    expect(parseMarkup('2 * 3 = 6')).toEqual([{ type: 'text', text: '2 * 3 = 6' }])
    expect(parseMarkup('****')).toEqual([{ type: 'text', text: '****' }])
    expect(parseMarkup('***')).toEqual([{ type: 'text', text: '***' }])
    expect(parseMarkup('*****')).toEqual([{ type: 'text', text: '*****' }])
  })
})
