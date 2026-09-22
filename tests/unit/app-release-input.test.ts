import {
  compareReleaseVersions,
  parseAppReleaseInput,
} from '@/lib/app-releases/input'

const valid = {
  platform: 'ios',
  latestVersion: '1.0.9',
  minimumVersion: '1.0.5',
  storeUrl: 'https://apps.apple.com/app/id6761642956',
  releaseNotes: 'Faster printing.',
}

describe('compareReleaseVersions', () => {
  test('orders numerically, so 1.0.10 is newer than 1.0.9', () => {
    expect(compareReleaseVersions('1.0.10', '1.0.9')).toBe(1)
  })

  test('treats a short version as zero-padded', () => {
    expect(compareReleaseVersions('1.2', '1.2.0')).toBe(0)
  })
})

describe('parseAppReleaseInput', () => {
  test('accepts a well-formed submission', () => {
    const parsed = parseAppReleaseInput(valid)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.input.latestVersion).toBe('1.0.9')
    expect(parsed.input.releaseNotes).toBe('Faster printing.')
  })

  test('accepts an empty notes field as no notes', () => {
    const parsed = parseAppReleaseInput({ ...valid, releaseNotes: '' })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.input.releaseNotes).toBeNull()
  })

  test('rejects an unknown platform', () => {
    expect(parseAppReleaseInput({ ...valid, platform: 'windows' }).ok).toBe(false)
  })

  test('rejects a version that is not a dotted number', () => {
    expect(parseAppReleaseInput({ ...valid, latestVersion: 'v1.0.9' }).ok).toBe(false)
    expect(parseAppReleaseInput({ ...valid, minimumVersion: '' }).ok).toBe(false)
    expect(parseAppReleaseInput({ ...valid, latestVersion: '1.0.9.4' }).ok).toBe(false)
  })

  test('rejects a store link that is not https', () => {
    expect(parseAppReleaseInput({ ...valid, storeUrl: 'http://apps.apple.com/x' }).ok).toBe(false)
    expect(parseAppReleaseInput({ ...valid, storeUrl: 'not a url' }).ok).toBe(false)
  })

  // This is the mistake that would lock every merchant out of the app with no
  // version able to clear the floor. It must be impossible to submit.
  test('rejects a minimum above the latest version', () => {
    const parsed = parseAppReleaseInput({ ...valid, minimumVersion: '1.1.0' })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.error).toMatch(/minimum/i)
  })

  test('allows a minimum equal to the latest version', () => {
    expect(parseAppReleaseInput({ ...valid, minimumVersion: '1.0.9' }).ok).toBe(true)
  })

  test('rejects a non-object submission', () => {
    expect(parseAppReleaseInput(null).ok).toBe(false)
    expect(parseAppReleaseInput('1.0.9').ok).toBe(false)
  })
})
