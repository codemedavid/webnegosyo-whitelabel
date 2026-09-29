import {
  clampNumber,
  cssColor,
  cssString,
  cssUrl,
  isSafeColor,
  pickEnum,
  safeAnchor,
  safeHref,
  safeMediaUrl,
  themeColorRef,
} from '@/lib/hero-builder/safe-values'
import { LIMITS } from '@/lib/hero-builder/constants'

describe('isSafeColor / cssColor', () => {
  it.each([
    '#fff',
    '#FFFF',
    '#112233',
    '#11223344',
    'rgb(10, 20, 30)',
    'rgba(10,20,30,0.5)',
    'rgb(10 20 30 / 50%)',
    'hsl(120, 50%, 50%)',
    'hsla(120, 50%, 50%, .3)',
    'transparent',
    'currentColor',
    '@primary',
    '@surface',
    '  #abc  ',
  ])('accepts %p', (value) => {
    // Act + Assert
    expect(isSafeColor(value)).toBe(true)
    expect(cssColor(value)).not.toBeNull()
  })

  it.each([
    'red;}</style><script>alert(1)</script>',
    'url(x)',
    'url(https://evil.com/x.png)',
    'expression(alert(1))',
    '@unknown',
    '@primary;x',
    '#ggg',
    '#12345',
    'rgb(1,2,3);background:url(x)',
    'rgb(1,2,3)}body{',
    'var(--x)',
    'red',
    '',
    '   ',
    '#' + 'a'.repeat(80),
  ])('rejects %p', (value) => {
    // Act + Assert
    expect(isSafeColor(value)).toBe(false)
    expect(cssColor(value)).toBeNull()
  })

  it.each([null, undefined, 42, {}, ['#fff']])('rejects non-string %p', (value) => {
    expect(isSafeColor(value)).toBe(false)
    expect(cssColor(value)).toBeNull()
  })

  it('maps theme references to hero CSS variables', () => {
    expect(cssColor('@primary')).toBe('var(--hb-primary)')
    expect(cssColor(themeColorRef('muted'))).toBe('var(--hb-muted)')
  })

  it('returns trimmed literal colors unchanged', () => {
    expect(cssColor('  #abcdef ')).toBe('#abcdef')
    expect(cssColor('rgba(1,2,3,.5)')).toBe('rgba(1,2,3,.5)')
  })
})

describe('safeHref', () => {
  it.each([
    ['https://example.com/menu', 'https://example.com/menu'],
    ['http://example.com', 'http://example.com/'],
    ['mailto:hi@example.com', 'mailto:hi@example.com'],
    ['tel:+639171234567', 'tel:+639171234567'],
    ['sms:+639171234567', 'sms:+639171234567'],
    ['/path/to/page', '/path/to/page'],
    ['#storefront-menu', '#storefront-menu'],
    ['  #anchor  ', '#anchor'],
  ])('allows %p', (input, expected) => {
    expect(safeHref(input)).toBe(expected)
  })

  it.each([
    'javascript:alert(1)',
    ' JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    '//evil.com',
    '/\\evil.com',
    '/path"onmouseover="x',
    'file:///etc/passwd',
    'ftp://example.com',
    'not a url',
    '',
  ])('rejects %p', (input) => {
    expect(safeHref(input)).toBeNull()
  })

  it('rejects over-long links', () => {
    expect(safeHref('https://example.com/' + 'a'.repeat(LIMITS.urlLength))).toBeNull()
  })

  it.each([null, undefined, 1, {}])('rejects non-string %p', (input) => {
    expect(safeHref(input)).toBeNull()
  })
})

describe('safeMediaUrl', () => {
  it('accepts absolute https URLs and normalises them', () => {
    expect(safeMediaUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png')
  })

  it.each([
    'http://cdn.example.com/a.png',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    '//cdn.example.com/a.png',
    '/relative.png',
    'blob:https://example.com/uuid',
    '',
    null,
    42,
  ])('rejects %p', (input) => {
    expect(safeMediaUrl(input)).toBeNull()
  })

  it('rejects over-long URLs', () => {
    expect(safeMediaUrl('https://x.com/' + 'a'.repeat(LIMITS.urlLength))).toBeNull()
  })

  it('percent-encodes markup characters so they cannot break out of CSS', () => {
    const url = safeMediaUrl('https://x.com/a"b<c>d?q="</style>#"<x>')
    expect(url).not.toBeNull()
    expect(url).not.toMatch(/[<>"]/)
  })
})

describe('cssString', () => {
  it('escapes backslashes and double quotes', () => {
    expect(cssString('a\\b"c')).toBe('a\\\\b\\"c')
  })

  it('replaces newlines, carriage returns and form feeds with spaces', () => {
    expect(cssString('a\nb\rc\fd')).toBe('a b c d')
  })

  it('escapes angle brackets as CSS hex escapes', () => {
    const out = cssString('</style><script>')
    expect(out).not.toMatch(/[<>]/)
    expect(out).toBe('\\3c /style\\3e \\3c script\\3e ')
  })
})

describe('cssUrl', () => {
  it('wraps a safe https URL in url("")', () => {
    expect(cssUrl('https://x.com/a.png')).toBe('url("https://x.com/a.png")')
  })

  it('returns null for unsafe URLs', () => {
    expect(cssUrl('javascript:alert(1)')).toBeNull()
    expect(cssUrl('http://x.com/a.png')).toBeNull()
  })
})

describe('clampNumber / pickEnum', () => {
  it('clamps finite numbers into range', () => {
    expect(clampNumber(5, 0, 10)).toBe(5)
    expect(clampNumber(-5, 0, 10)).toBe(0)
    expect(clampNumber(50, 0, 10)).toBe(10)
  })

  it.each([NaN, Infinity, '5', null, undefined])('returns null for %p', (value) => {
    expect(clampNumber(value, 0, 10)).toBeNull()
  })

  it('picks only allowed enum values', () => {
    const allowed = ['a', 'b'] as const
    expect(pickEnum('a', allowed)).toBe('a')
    expect(pickEnum('c', allowed)).toBeNull()
    expect(pickEnum('constructor', allowed)).toBeNull()
    expect(pickEnum(1, allowed)).toBeNull()
  })
})

describe('safeAnchor', () => {
  it('slugifies to lowercase letters, digits and dashes', () => {
    expect(safeAnchor('  Our Menu  ')).toBe('our-menu')
    expect(safeAnchor('Promo #1 <b>!</b>')).toBe('promo-1-bb')
    expect(safeAnchor('"><script>alert(1)</script>')).toBe('scriptalert1script')
  })

  it('caps the anchor at 48 characters', () => {
    expect(safeAnchor('a'.repeat(100))).toHaveLength(48)
  })

  it('returns null when nothing usable remains', () => {
    expect(safeAnchor('!!!')).toBeNull()
    expect(safeAnchor('')).toBeNull()
    expect(safeAnchor(12)).toBeNull()
  })
})
