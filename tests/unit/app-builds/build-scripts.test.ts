/** @jest-environment node */
import sharp from 'sharp'
import { checkAppAssets, isUsableMark, makeAppAssets } from '../../../scripts/customer-app-build/assets.mjs'
import { easBuildIdFrom, githubEnvLines, identityEnv, readManifest, withSubmitProfile } from '../../../scripts/customer-app-build/ci-lib.mjs'

const BUILD_ID = '0f2b6c1e-3a4d-4e5f-8a9b-0c1d2e3f4a5b'
const MANIFEST = {
  version: 1,
  buildId: BUILD_ID,
  platform: 'ios',
  message: `wnb:${BUILD_ID}`,
  identity: { displayName: 'Kape Demo', bundleId: 'com.webnegosyo.kapedemo', androidPackage: 'com.webnegosyo.kapedemo', splashBackground: '#1A2B3C' },
  assets: { iconUrl: 'https://ik.imagekit.io/x/icon.png', splashUrl: null },
  submit: { enabled: true, ascAppId: '1234567890', playTrack: 'internal' },
}

describe('ci-lib (the workflow re-checks what the web sent)', () => {
  it('accepts a good manifest and refuses anything it would put into env or paths unchecked', () => {
    expect(readManifest({ manifest: MANIFEST })).toEqual({ manifest: MANIFEST, problems: [] })
    const bad = (patch: Record<string, unknown>) => readManifest({ manifest: { ...MANIFEST, ...patch } }).problems
    expect(bad({ identity: { ...MANIFEST.identity, displayName: 'Kape\nEVIL=1' } })).toContain('bad display name')
    expect(bad({ identity: { ...MANIFEST.identity, bundleId: 'com.x; rm -rf' } })).toContain('bad bundle id')
    expect(bad({ assets: { iconUrl: 'file:///etc/passwd', splashUrl: null } })).toContain('bad icon url')
    expect(bad({ submit: { ...MANIFEST.submit, playTrack: 'production' } })).toContain('submissions go to the internal track only')
    expect(bad({ message: 'wnb:other' })).toContain('bad build message')
    expect(readManifest({}).problems).toEqual(['the answer has no manifest'])
  })

  it('writes $GITHUB_ENV lines that a value cannot break out of', () => {
    const delimiter = 'WNB_0123456789abcdef'
    expect(githubEnvLines({ APP_NAME: 'Kape Demo' }, delimiter)).toBe(`APP_NAME<<${delimiter}\nKape Demo\n${delimiter}\n`)
    expect(() => githubEnvLines({ APP_NAME: `x\n${delimiter}\nEVIL=1` }, delimiter)).toThrow(/delimiter/)
    expect(() => githubEnvLines({ 'bad-name': 'x' }, delimiter)).toThrow(/bad env name/)
    expect(() => githubEnvLines({ A: 'x' }, 'short')).toThrow(/delimiter/)
  })

  it('maps the manifest onto the env app.config.ts reads', () => {
    expect(identityEnv(MANIFEST, './build-assets', '#FFFFFF')).toMatchObject({
      APP_PLATFORM: 'ios',
      APP_NAME: 'Kape Demo',
      APP_BUNDLE_ID: 'com.webnegosyo.kapedemo',
      APP_ICON: './build-assets/icon.png',
      APP_NOTIFICATION_ICON: './build-assets/notification-icon.png',
      APP_ADAPTIVE_BACKGROUND: '#FFFFFF',
      APP_SUBMIT: 'true',
    })
  })

  it('reads the EAS build id from either output shape, or gives up cleanly', () => {
    const id = '11111111-2222-4333-8444-555555555555'
    expect(easBuildIdFrom(JSON.stringify([{ id, platform: 'IOS' }]))).toBe(id)
    expect(easBuildIdFrom(JSON.stringify({ id: id.toUpperCase() }))).toBe(id)
    expect(easBuildIdFrom('Build queued…')).toBeNull()
    expect(easBuildIdFrom(JSON.stringify([{ id: 'x' }]))).toBeNull()
  })

  it('fills the submit profile per platform and keeps the rest of eas.json', () => {
    const eas = { build: { store: { channel: 'production' } }, submit: { store: { android: { track: 'internal', releaseStatus: 'completed' } } } }
    const ios = withSubmitProfile(eas, MANIFEST, { ascApiKeyPath: '/k.p8', ascApiKeyId: 'KEY', ascApiKeyIssuerId: 'ISS', appleTeamId: 'TEAM' })
    expect(ios.submit.store.ios).toEqual({ ascAppId: '1234567890', ascApiKeyPath: '/k.p8', ascApiKeyId: 'KEY', ascApiKeyIssuerId: 'ISS', appleTeamId: 'TEAM' })
    expect(ios.build).toEqual(eas.build)
    const android = withSubmitProfile(eas, { ...MANIFEST, platform: 'android' }, { googleServiceAccountKeyPath: '/sa.json' })
    expect(android.submit.store.android).toEqual({ track: 'internal', releaseStatus: 'completed', serviceAccountKeyPath: '/sa.json' })
    expect(eas.submit.store).not.toHaveProperty('ios')
  })
})

/** A 1024² icon: `mark` (white disc) on a coloured square. */
async function logoIcon(background: string, withAlpha = false) {
  const disc = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><circle cx="512" cy="512" r="260" fill="#FFFFFF"/></svg>')
  return sharp({ create: { width: 1024, height: 1024, channels: withAlpha ? 4 : 3, background: withAlpha ? { r: 0, g: 0, b: 0, alpha: 0 } : background } })
    .composite([{ input: disc }])
    .png()
    .toBuffer()
}

async function noiseIcon() {
  const raw = Buffer.alloc(1024 * 1024 * 3)
  let seed = 7
  for (let index = 0; index < raw.length; index += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    raw[index] = (seed >> 16) & 255 // high bits: an LCG's low byte repeats every 256 steps
  }
  return sharp(raw, { raw: { width: 1024, height: 1024, channels: 3 } }).png().toBuffer()
}

describe('store icons from the one app icon', () => {
  it('makes every file at its size, the iOS icon without alpha, and finds the logo mark', async () => {
    const assets = await makeAppAssets({ iconPng: await logoIcon('#C8102E'), splashBackground: '#C8102E' })
    expect(await checkAppAssets(assets.files)).toEqual([])
    expect(assets.usedFallbackMark).toBe(false)
    expect(assets.adaptiveBackground).toBe('#C8102E')
    expect(assets.markCoverage).toBeGreaterThan(0.15)
    expect(assets.markCoverage).toBeLessThan(0.25)
    expect(assets.flatShare).toBeGreaterThan(0.95)

    // The notification icon is white where the logo is and clear elsewhere.
    const { data, info } = await sharp(assets.files['notification-icon.png']).raw().toBuffer({ resolveWithObject: true })
    const at = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4))
    expect(at(48, 48)).toEqual([255, 255, 255, 255])
    expect(at(2, 2)[3]).toBe(0)

    // The adaptive foreground keeps the icon inside the 66% safe zone.
    const fg = await sharp(assets.files['adaptive-foreground.png']).raw().toBuffer({ resolveWithObject: true })
    expect(fg.data[(100 * 1024 + 100) * 4 + 3]).toBe(0)
    expect(fg.data[(512 * 1024 + 512) * 4 + 3]).toBe(255)
  })

  it('flattens a see-through icon onto the splash colour (Apple refuses alpha)', async () => {
    const assets = await makeAppAssets({ iconPng: await logoIcon('#000000', true), splashBackground: '#1A2B3C' })
    const meta = await sharp(assets.files['icon.png']).metadata()
    expect(meta.hasAlpha).toBe(false)
    const { data } = await sharp(assets.files['icon.png']).raw().toBuffer({ resolveWithObject: true })
    expect(Array.from(data.subarray(0, 3))).toEqual([0x1a, 0x2b, 0x3c])
  })

  it('falls back to the bag glyph when the icon has no clean mark (a photo)', async () => {
    const assets = await makeAppAssets({ iconPng: await noiseIcon(), splashBackground: '#FFFFFF' })
    expect(assets.usedFallbackMark).toBe(true)
    expect(await checkAppAssets(assets.files)).toEqual([])
    expect(isUsableMark(0.9)).toBe(false)
    expect(isUsableMark(0.001)).toBe(false)
    expect(isUsableMark(0.3)).toBe(true)
    expect(isUsableMark(0.3, 0.4)).toBe(false)
    expect(assets.flatShare).toBeLessThan(0.2)
  })

  it('refuses icons App Studio should never have let through', async () => {
    const wide = await sharp({ create: { width: 1200, height: 1024, channels: 3, background: '#FFFFFF' } }).png().toBuffer()
    await expect(makeAppAssets({ iconPng: wide, splashBackground: '#FFFFFF' })).rejects.toThrow(/square/)
    const small = await sharp({ create: { width: 512, height: 512, channels: 3, background: '#FFFFFF' } }).png().toBuffer()
    await expect(makeAppAssets({ iconPng: small, splashBackground: '#FFFFFF' })).rejects.toThrow(/at least 1024/)
  })

  it('uses the splash image when one is set, else the icon', async () => {
    const splash = await sharp({ create: { width: 2000, height: 800, channels: 3, background: '#00FF00' } }).png().toBuffer()
    const assets = await makeAppAssets({ iconPng: await logoIcon('#C8102E'), splashPng: splash, splashBackground: '#C8102E' })
    const meta = await sharp(assets.files['splash.png']).metadata()
    expect([meta.width, meta.height]).toEqual([1024, 410])
    const iconOnly = await makeAppAssets({ iconPng: await logoIcon('#C8102E'), splashBackground: '#C8102E' })
    expect(iconOnly.files['splash.png'].equals(iconOnly.files['icon.png'])).toBe(true)
  })
})
