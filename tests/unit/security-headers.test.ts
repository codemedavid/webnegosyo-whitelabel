import { describe, expect, it } from '@jest/globals'
import { buildContentSecurityPolicy, SECURITY_HEADERS } from '@/lib/security-headers'

function header(key: string): string {
  const found = SECURITY_HEADERS.find((entry) => entry.key === key)
  if (!found) throw new Error(`missing ${key}`)
  return found.value
}

function directive(policy: string, name: string): string[] {
  const entry = policy.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `))
  return entry ? entry.split(/\s+/).slice(1) : []
}

describe('SECURITY_HEADERS', () => {
  it('sets the plain hardening headers', () => {
    expect(header('X-Content-Type-Options')).toBe('nosniff')
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  })

  it('keeps every browser capability the product uses', () => {
    const policy = header('Permissions-Policy')
    expect(policy).toContain('geolocation=(self)')
    expect(policy).toContain('camera=(self)')
    expect(policy).toContain('microphone=(self)')
    expect(policy).not.toContain('geolocation=()')
    expect(policy).not.toContain('camera=()')
  })

  it('only ever REPORTS the content policy: enforcement is not part of this', () => {
    expect(SECURITY_HEADERS.some((entry) => entry.key === 'Content-Security-Policy')).toBe(false)
    expect(header('Content-Security-Policy-Report-Only')).toBe(buildContentSecurityPolicy())
  })

  it('never sets a frame rule: the middleware owns frame protection and storefronts stay embeddable', () => {
    expect(SECURITY_HEADERS.some((entry) => entry.key === 'X-Frame-Options')).toBe(false)
    expect(buildContentSecurityPolicy()).not.toContain('frame-ancestors')
  })
})

describe('buildContentSecurityPolicy', () => {
  const policy = buildContentSecurityPolicy()

  it.each([
    ['script-src', 'https://connect.facebook.net'],
    ['script-src', 'https://cdn.apple-mapkit.com'],
    ['img-src', 'https://media.webnegosyo.com'],
    ['img-src', 'https://ik.imagekit.io'],
    ['img-src', 'https://res.cloudinary.com'],
    ['img-src', 'https://images.unsplash.com'],
    ['img-src', 'https://www.facebook.com'],
    ['img-src', 'https://snapshot.apple-mapkit.com'],
    ['connect-src', 'https://*.supabase.co'],
    ['connect-src', 'wss://*.supabase.co'],
    ['connect-src', 'https://*.convex.cloud'],
    ['connect-src', 'wss://*.convex.cloud'],
    ['connect-src', 'https://api.mapbox.com'],
    ['connect-src', 'https://upload.imagekit.io'],
    ['connect-src', 'https://*.r2.cloudflarestorage.com'],
    ['connect-src', 'https://*.apple-mapkit.com'],
    ['style-src', 'https://fonts.googleapis.com'],
    ['font-src', 'https://fonts.gstatic.com'],
    ['frame-src', 'https://www.youtube-nocookie.com'],
    ['frame-src', 'https://player.vimeo.com'],
    ['frame-src', 'https://www.facebook.com'],
    ['media-src', 'https://videos.pexels.com'],
  ])('%s allows %s', (name, source) => {
    expect(directive(policy, name)).toContain(source)
  })

  it('names a default for everything else', () => {
    expect(directive(policy, 'default-src')).toEqual(["'self'"])
    expect(directive(policy, 'object-src')).toEqual(["'none'"])
    expect(directive(policy, 'base-uri')).toEqual(["'self'"])
  })

  it('adds a report sink only when one is configured', () => {
    expect(policy).not.toContain('report-uri')
    expect(buildContentSecurityPolicy('https://sink.example/csp')).toContain('report-uri https://sink.example/csp')
  })
})
