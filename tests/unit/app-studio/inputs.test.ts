import { appIdentityInputSchema, appListingInputSchema, appReleaseInputSchema, defaultAppIds, reviewPhoneSchema } from '@/lib/app-studio/inputs'

// The database's own CHECKs (20261026150000_tenant_apps.sql).
const DB_IOS = /^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z][A-Za-z0-9-]*)+$/
const DB_ANDROID = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/

describe('defaultAppIds', () => {
  it.each(['sample-demo', 'beracah-cafe', '7eleven', 'Kape--Demo', 'café-ñ', '---', 'a'])('%p gives ids the database accepts', (slug) => {
    const ids = defaultAppIds(slug)
    expect(ids.bundleId).toMatch(DB_IOS)
    expect(ids.androidPackage).toMatch(DB_ANDROID)
    expect(ids.bundleId.startsWith('com.webnegosyo.')).toBe(true)
  })

  it('keeps the slug readable: hyphens on iOS, underscores on Android', () => {
    expect(defaultAppIds('sample-demo')).toEqual({ bundleId: 'com.webnegosyo.sample-demo', androidPackage: 'com.webnegosyo.sample_demo' })
    expect(defaultAppIds('7eleven').bundleId).toBe('com.webnegosyo.s7eleven')
  })
})

const identity = {
  displayName: 'Sample Demo',
  bundleId: 'com.webnegosyo.sample-demo',
  androidPackage: 'com.webnegosyo.sample_demo',
  iconUrl: '',
  splashUrl: null,
  splashBackground: '#4DDB00',
  storeAccount: { apple: 'webnegosyo', google: 'webnegosyo' },
}

describe('identity', () => {
  it('accepts a valid identity and turns blanks into null', () => {
    const parsed = appIdentityInputSchema.parse(identity)
    expect(parsed.iconUrl).toBeNull()
    expect(parsed.splashBackground).toBe('#4DDB00')
  })

  it('refuses what the stores or the database would', () => {
    expect(appIdentityInputSchema.safeParse({ ...identity, displayName: 'x'.repeat(31) }).success).toBe(false)
    expect(appIdentityInputSchema.safeParse({ ...identity, androidPackage: 'com.webnegosyo.sample-demo' }).success).toBe(false)
    expect(appIdentityInputSchema.safeParse({ ...identity, iconUrl: 'http://cdn.example.com/icon.png' }).success).toBe(false)
    expect(appIdentityInputSchema.safeParse({ ...identity, storeAccount: { apple: 'someone', google: 'webnegosyo' } }).success).toBe(false)
  })
})

describe('listing and release', () => {
  it('holds the App Store limits', () => {
    expect(appListingInputSchema.safeParse({ subtitle: 'x'.repeat(31) }).success).toBe(false)
    expect(appListingInputSchema.parse({}).category).toBe('food_and_drink')
  })

  const release = { status: 'draft', minVersionIos: '', latestVersionIos: '', minVersionAndroid: null, latestVersionAndroid: null, appStoreUrl: '', playStoreUrl: '', ascAppId: '', playTrack: 'internal' }

  it('never lets the minimum pass the latest version (that locks every customer out)', () => {
    expect(appReleaseInputSchema.safeParse({ ...release, minVersionIos: '1.2.0', latestVersionIos: '1.1.9' }).success).toBe(false)
    expect(appReleaseInputSchema.safeParse({ ...release, minVersionIos: '1.0.0' }).success).toBe(false)
    expect(appReleaseInputSchema.safeParse({ ...release, minVersionIos: '1.0.10', latestVersionIos: '1.0.10' }).success).toBe(true)
    expect(appReleaseInputSchema.safeParse({ ...release, minVersionAndroid: '1.0.9', latestVersionAndroid: '1.0.10' }).success).toBe(true)
  })

  it('takes only a PH mobile as the review number', () => {
    expect(reviewPhoneSchema.safeParse('+639171234567').success).toBe(true)
    expect(reviewPhoneSchema.safeParse('09171234567').success).toBe(false)
  })
})
