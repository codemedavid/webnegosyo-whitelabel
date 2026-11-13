/**
 * @jest-environment node
 */
import { buildIdFromMessage, buildManifest, buildProblems, submitNote, type BuildableApp } from '@/lib/app-builds/manifest'
import { canMove, staleReason, statusFromEas, BUILD_STATUSES } from '@/lib/app-builds/status'
import { easSignatureFor, easWebhookBodySchema, readEasEvent, verifyEasSignature } from '@/lib/app-builds/eas-webhook'
import { bearerBuildToken, dispatchBuildWorkflow, hashBuildToken, isCiSecret, missingPipelineEnv, newBuildToken, readPipelineConfig } from '@/lib/app-builds/pipeline'

const BUILD_ID = '0f2b6c1e-3a4d-4e5f-8a9b-0c1d2e3f4a5b'
const EAS_ID = '11111111-2222-4333-8444-555555555555'

const APP: BuildableApp = {
  display_name: 'Kape Demo ',
  bundle_id: 'com.webnegosyo.kapedemo',
  android_package: 'com.webnegosyo.kapedemo',
  icon_url: 'https://ik.imagekit.io/x/icon.png',
  splash_url: null,
  splash_background: '#1a2b3c',
  asc_app_id: null,
}

describe('build status order (mirrors the forward-only trigger)', () => {
  it('moves forward only, and a terminal status never changes', () => {
    expect(canMove('queued', 'preparing')).toBe(true)
    expect(canMove('queued', 'building')).toBe(true)
    expect(canMove('building', 'finished')).toBe(true)
    expect(canMove('preparing', 'queued')).toBe(false)
    for (const terminal of ['finished', 'errored', 'cancelled'] as const) {
      for (const next of BUILD_STATUSES) expect(canMove(terminal, next)).toBe(next === terminal)
    }
  })

  it('calls a build stuck only after its grace period', () => {
    const now = new Date('2026-11-13T12:00:00Z')
    expect(staleReason({ status: 'queued', updatedAt: '2026-11-13T11:45:00Z' }, now)).toBeNull()
    expect(staleReason({ status: 'queued', updatedAt: '2026-11-13T11:00:00Z' }, now)).toMatch(/didn’t start/)
    expect(staleReason({ status: 'preparing', updatedAt: '2026-11-13T11:00:00Z' }, now)).toMatch(/didn’t start/)
    expect(staleReason({ status: 'building', updatedAt: '2026-11-13T06:00:00Z' }, now)).toBeNull()
    expect(staleReason({ status: 'building', updatedAt: '2026-11-12T23:00:00Z' }, now)).toMatch(/12 hours/)
    expect(staleReason({ status: 'finished', updatedAt: '2020-01-01T00:00:00Z' }, now)).toBeNull()
  })

  it('reads EAS statuses (both spellings of cancelled)', () => {
    expect(statusFromEas('finished')).toBe('finished')
    expect(statusFromEas('errored')).toBe('errored')
    expect(statusFromEas('canceled')).toBe('cancelled')
    expect(statusFromEas('in-progress')).toBeNull()
  })
})

describe('build manifest', () => {
  it('snapshots the identity, sends iOS to TestFlight only with an App Store Connect id', () => {
    const ios = buildManifest(APP, BUILD_ID, 'ios')
    expect(ios).toEqual({
      version: 1,
      buildId: BUILD_ID,
      platform: 'ios',
      message: `wnb:${BUILD_ID}`,
      identity: { displayName: 'Kape Demo', bundleId: APP.bundle_id, androidPackage: APP.android_package, splashBackground: '#1A2B3C' },
      assets: { iconUrl: APP.icon_url, splashUrl: null },
      submit: { enabled: false, ascAppId: null, playTrack: 'internal' },
    })
    expect(submitNote(APP, 'ios')).toMatch(/App Store Connect/)
    expect(buildManifest({ ...APP, asc_app_id: '1234567890' }, BUILD_ID, 'ios').submit).toEqual({ enabled: true, ascAppId: '1234567890', playTrack: 'internal' })
  })

  it('sends Android to the internal track only, whatever the release track says', () => {
    expect(buildManifest(APP, BUILD_ID, 'android').submit).toEqual({ enabled: true, ascAppId: null, playTrack: 'internal' })
  })

  it('names what stops a build, and refuses to build without it', () => {
    const broken = { ...APP, icon_url: null, splash_background: null }
    expect(buildProblems(broken)).toEqual(['Add an app icon (Identity tab).', 'Pick a splash colour (Identity tab).'])
    expect(() => buildManifest(broken, BUILD_ID, 'ios')).toThrow(/not buildable/)
    expect(buildProblems(APP)).toEqual([])
  })

  it('reads back only build messages we wrote', () => {
    expect(buildIdFromMessage(`wnb:${BUILD_ID.toUpperCase()}`)).toBe(BUILD_ID)
    expect(buildIdFromMessage('wnb:not-a-uuid')).toBeNull()
    expect(buildIdFromMessage(`release ${BUILD_ID}`)).toBeNull()
    expect(buildIdFromMessage(undefined)).toBeNull()
  })
})

describe('EAS webhook', () => {
  const SECRET = 'a-webhook-secret-of-length'
  const body = JSON.stringify({ id: EAS_ID, status: 'finished' })

  it('accepts only the exact sha1 HMAC of the raw body', () => {
    const signature = easSignatureFor(body, SECRET)
    expect(signature).toMatch(/^sha1=[0-9a-f]{40}$/)
    expect(verifyEasSignature(body, signature, SECRET)).toBe(true)
    expect(verifyEasSignature(`${body} `, signature, SECRET)).toBe(false)
    expect(verifyEasSignature(body, signature, 'another-secret-xyz')).toBe(false)
    expect(verifyEasSignature(body, signature.replace('sha1=', ''), SECRET)).toBe(false)
    expect(verifyEasSignature(body, null, SECRET)).toBe(false)
    // A missing or too-short secret fails closed.
    expect(verifyEasSignature(body, easSignatureFor(body, 'short'), 'short')).toBe(false)
    expect(verifyEasSignature(body, signature, undefined)).toBe(false)
  })

  const read = (payload: unknown) => readEasEvent(easWebhookBodySchema.parse(payload))

  it('reads a finished build: artifact, version, build number, our build id from the message', () => {
    expect(
      read({
        id: EAS_ID.toUpperCase(),
        platform: 'ios',
        status: 'finished',
        artifacts: { buildUrl: 'https://expo.dev/artifacts/eas/abc.ipa' },
        metadata: { appVersion: '1.0.0', appBuildVersion: '7', message: `wnb:${BUILD_ID}`, somethingNew: { x: 1 } },
      }),
    ).toEqual({
      kind: 'build',
      easBuildId: EAS_ID,
      buildId: BUILD_ID,
      status: 'finished',
      artifactUrl: 'https://expo.dev/artifacts/eas/abc.ipa',
      appVersion: '1.0.0',
      buildNumber: '7',
      error: null,
    })
  })

  it('reads a failed build with its reason, and drops a non-https artifact', () => {
    const event = read({ id: EAS_ID, status: 'errored', error: { message: 'Pod install failed', errorCode: 'X' }, artifacts: { buildUrl: 'http://x' } })
    expect(event).toMatchObject({ kind: 'build', status: 'errored', error: 'Pod install failed', artifactUrl: null })
    expect(read({ id: EAS_ID, status: 'canceled' })).toMatchObject({ kind: 'build', status: 'cancelled', error: 'The build was cancelled on EAS.' })
  })

  it('reads a submission by the build it sent', () => {
    expect(read({ id: BUILD_ID, status: 'finished', turtleBuildId: EAS_ID })).toEqual({ kind: 'submit', easBuildId: EAS_ID, ok: true, error: null })
    expect(read({ id: BUILD_ID, status: 'errored', turtleBuildId: EAS_ID, submissionInfo: { error: { message: 'Missing compliance' } } })).toEqual({
      kind: 'submit',
      easBuildId: EAS_ID,
      ok: false,
      error: 'Missing compliance',
    })
  })

  it('ignores statuses that are not a completion, and odd shapes do not turn into a 400', () => {
    expect(read({ id: EAS_ID, status: 'in-progress' })).toEqual({ kind: 'ignored', reason: 'build status in-progress' })
    expect(read({ id: EAS_ID, status: 'finished', metadata: 'weird', artifacts: 5 })).toMatchObject({ kind: 'build', artifactUrl: null, buildId: null })
    expect(easWebhookBodySchema.safeParse({ id: 'nope', status: 'finished' }).success).toBe(false)
  })
})

describe('pipeline wiring', () => {
  const READY = {
    GITHUB_DISPATCH_TOKEN: 'github_pat_x',
    APP_BUILD_GITHUB_REPO: 'owner/repo',
    APP_BUILD_CI_SECRET: 'c'.repeat(32),
    EAS_WEBHOOK_SECRET: 'w'.repeat(20),
  } as unknown as NodeJS.ProcessEnv

  it('names every missing env var and is ready only with all of them', () => {
    expect(missingPipelineEnv({} as unknown as NodeJS.ProcessEnv)).toEqual(['GITHUB_DISPATCH_TOKEN', 'APP_BUILD_GITHUB_REPO', 'APP_BUILD_CI_SECRET', 'EAS_WEBHOOK_SECRET'])
    expect(missingPipelineEnv({ ...READY, APP_BUILD_CI_SECRET: 'short' })).toEqual(['APP_BUILD_CI_SECRET'])
    expect(missingPipelineEnv({ ...READY, APP_BUILD_GITHUB_REPO: 'https://github.com/owner/repo' })).toEqual(['APP_BUILD_GITHUB_REPO'])
    expect(readPipelineConfig(READY)).toEqual({ dispatchToken: 'github_pat_x', repo: 'owner/repo', ref: 'main', dryRun: false })
    expect(readPipelineConfig({ ...READY, APP_BUILD_DRY_RUN: '1' })?.dryRun).toBe(true)
    expect(readPipelineConfig({ ...READY, APP_BUILD_GITHUB_REF: 'release' })?.ref).toBe('release')
  })

  it('makes random tokens and keeps only their hash', () => {
    const one = newBuildToken()
    const two = newBuildToken()
    expect(one.token).not.toBe(two.token)
    expect(one.hash).toBe(hashBuildToken(one.token))
    expect(one.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(bearerBuildToken(`Bearer ${one.token}`)).toBe(one.token)
    expect(bearerBuildToken(one.token)).toBeNull()
    expect(bearerBuildToken('Bearer wnbt_short')).toBeNull()
    expect(bearerBuildToken(null)).toBeNull()
  })

  it('checks the CI secret and fails closed without one', () => {
    expect(isCiSecret('c'.repeat(32), READY)).toBe(true)
    expect(isCiSecret('c'.repeat(31), READY)).toBe(false)
    expect(isCiSecret(null, READY)).toBe(false)
    expect(isCiSecret('', { APP_BUILD_CI_SECRET: '' } as unknown as NodeJS.ProcessEnv)).toBe(false)
    expect(isCiSecret('short', { APP_BUILD_CI_SECRET: 'short' } as unknown as NodeJS.ProcessEnv)).toBe(false)
  })

  it('dispatches the workflow with only the build token, and reports GitHub refusals', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response(null, { status: 204 })
    }) as unknown as typeof fetch
    const config = readPipelineConfig(READY)!
    await expect(dispatchBuildWorkflow(config, 'wnbt_token', fake)).resolves.toEqual({ ok: true })
    expect(calls[0].url).toBe('https://api.github.com/repos/owner/repo/actions/workflows/build-customer-app.yml/dispatches')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ ref: 'main', inputs: { build_token: 'wnbt_token' } })
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer github_pat_x')

    await dispatchBuildWorkflow({ ...config, dryRun: true }, 'wnbt_token', fake)
    expect(JSON.parse(String(calls[1].init.body)).inputs).toEqual({ build_token: 'wnbt_token', dry_run: 'true' })

    const refusing = (async () => new Response('{}', { status: 422 })) as unknown as typeof fetch
    await expect(dispatchBuildWorkflow(config, 'wnbt_token', refusing)).resolves.toEqual({ ok: false, reason: 'GitHub answered 422' })
    const down = (async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    await expect(dispatchBuildWorkflow(config, 'wnbt_token', down)).resolves.toEqual({ ok: false, reason: 'GitHub could not be reached' })
  })
})
