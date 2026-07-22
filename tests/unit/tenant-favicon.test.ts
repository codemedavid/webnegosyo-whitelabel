import { resolveTenantFavicon } from '@/lib/tenant-favicon'

// The favicon helper turns a tenant's logo into `icons` metadata so the
// browser-tab favicon becomes the merchant's own logo. When there is no logo,
// it must return undefined so Next.js falls back to the platform favicon.ico.

describe('resolveTenantFavicon', () => {
  const IMAGEKIT_LOGO = 'https://ik.imagekit.io/webnegosyo/logos/acme.png'

  it('returns undefined when tenant is null', () => {
    expect(resolveTenantFavicon(null)).toBeUndefined()
  })

  it('returns undefined when tenant is undefined', () => {
    expect(resolveTenantFavicon(undefined)).toBeUndefined()
  })

  it('returns undefined when logo_url is missing', () => {
    expect(resolveTenantFavicon({})).toBeUndefined()
  })

  it('returns undefined when logo_url is an empty or whitespace string', () => {
    expect(resolveTenantFavicon({ logo_url: '' })).toBeUndefined()
    expect(resolveTenantFavicon({ logo_url: '   ' })).toBeUndefined()
  })

  it('returns icon, shortcut, and apple entries pointing at the logo', () => {
    const icons = resolveTenantFavicon({ logo_url: IMAGEKIT_LOGO })

    expect(icons).toBeDefined()
    expect(icons).toHaveProperty('icon')
    expect(icons).toHaveProperty('shortcut')
    expect(icons).toHaveProperty('apple')
  })

  it('downsizes an ImageKit logo to a square favicon via a transform', () => {
    const icons = resolveTenantFavicon({ logo_url: IMAGEKIT_LOGO }) as {
      icon: { url: string }[]
    }

    const url = icons.icon[0].url
    expect(url).toContain('tr=')
    expect(url).toContain('w-64')
    expect(url).toContain('h-64')
  })

  it('trims surrounding whitespace before using the logo url', () => {
    const icons = resolveTenantFavicon({ logo_url: `  ${IMAGEKIT_LOGO}  ` }) as {
      icon: { url: string }[]
    }

    expect(icons.icon[0].url).toContain('ik.imagekit.io')
    expect(icons.icon[0].url.startsWith('http')).toBe(true)
  })

  it('passes through a non-optimizable logo url unchanged', () => {
    const plainUrl = 'https://cdn.example.com/logo.png'
    const icons = resolveTenantFavicon({ logo_url: plainUrl }) as {
      icon: { url: string }[]
    }

    expect(icons.icon[0].url).toBe(plainUrl)
  })
})
