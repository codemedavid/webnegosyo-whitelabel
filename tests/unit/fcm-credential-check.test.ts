/** @jest-environment node */
/**
 * Android push has two halves configured in different places: the Firebase
 * project compiled into the APK (`google-services.json`) and the FCM V1 key
 * uploaded to EAS that Expo signs sends with. When they name different
 * Firebase projects, FCM drops every Android notification with
 * `MismatchSenderId` — and every layer above still reports a clean send, so
 * the only way to learn about it is to be told by a merchant.
 *
 * This is the build-time guard that makes that combination unshippable. It is
 * driven as a subprocess, against a stub of Expo's GraphQL API, because its
 * whole job is the exit code the CI step reads.
 */
import { spawn } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { AddressInfo } from 'node:net'

const SCRIPT = resolve('webnegosyo-app/scripts/check-fcm-credentials.mjs')
const BUILD_PROJECT = 'webnegosyo-aa986'

/** A `google-services.json` naming `projectId`, in a throwaway directory. */
function writeGoogleServices(dir: string, projectId: string): string {
  const path = join(dir, 'google-services.json')
  writeFileSync(
    path,
    JSON.stringify({
      project_info: { project_id: projectId, project_number: '31173691146' },
      client: [{ client_info: { android_client_info: { package_name: 'com.webnegosyo.admin' } } }],
    })
  )
  return path
}

/** Stands in for api.expo.dev, answering with the credential EAS would hold. */
async function startExpoStub(projectIdentifier: string | null): Promise<{
  url: string
  close: () => Promise<void>
}> {
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        data: {
          app: {
            byFullName: {
              androidAppCredentials: [
                {
                  applicationIdentifier: 'com.webnegosyo.admin',
                  androidFcm: null,
                  googleServiceAccountKeyForFcmV1:
                    projectIdentifier === null ? null : { projectIdentifier, clientEmail: 'x@y.iam' },
                },
              ],
            },
          },
        },
      })
    )
  })
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/graphql`,
    close: () => new Promise<void>((done) => server.close(() => done())),
  }
}

interface CheckResult {
  status: number | null
  stdout: string
  stderr: string
}

/**
 * Runs the script as a child process. Asynchronously, deliberately:
 * `spawnSync` would block this process's event loop, and the stub Expo API is
 * served from it — the child's request would never be answered and neither
 * side would ever finish.
 */
function runCheck(env: Record<string, string>): Promise<CheckResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT], {
      env: {
        PATH: process.env.PATH ?? '',
        NODE_ENV: 'test',
        EXPO_TOKEN: 'test-token',
        ...env,
      } as NodeJS.ProcessEnv,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

describe('check-fcm-credentials', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fcm-check-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('passes when the build and the EAS credential name the same Firebase project', async () => {
    const stub = await startExpoStub(BUILD_PROJECT)
    try {
      const result = await runCheck({
        GOOGLE_SERVICES_JSON: writeGoogleServices(dir, BUILD_PROJECT),
        EXPO_API_URL: stub.url,
      })
      expect(result.status).toBe(0)
      expect(result.stdout).toContain(BUILD_PROJECT)
    } finally {
      await stub.close()
    }
  })

  it('fails the build when the two name different Firebase projects', async () => {
    // The live outage, reproduced: the APK was built against webnegosyo-aa986
    // while EAS signed every push with a key for webnegosyo-18e8c.
    const stub = await startExpoStub('webnegosyo-18e8c')
    try {
      const result = await runCheck({
        GOOGLE_SERVICES_JSON: writeGoogleServices(dir, BUILD_PROJECT),
        EXPO_API_URL: stub.url,
      })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('MismatchSenderId')
      // The message has to carry the fix, not just the diagnosis — whoever
      // sees this in CI is not the person who uploaded the key months ago.
      expect(result.stderr).toContain('eas credentials -p android')
    } finally {
      await stub.close()
    }
  })

  it('fails when EAS holds no FCM V1 key at all', async () => {
    const stub = await startExpoStub(null)
    try {
      const result = await runCheck({
        GOOGLE_SERVICES_JSON: writeGoogleServices(dir, BUILD_PROJECT),
        EXPO_API_URL: stub.url,
      })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('no FCM V1 key')
    } finally {
      await stub.close()
    }
  })

  it('fails when the build has no google-services.json to check', async () => {
    const result = await runCheck({ GOOGLE_SERVICES_JSON: join(dir, 'missing.json') })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Could not read google-services.json')
  })

  it('skips rather than fails when the EAS half cannot be read', async () => {
    // A developer with no Expo session must still be able to build. Silence
    // here would be wrong, so it warns — but only STRICT turns that into a
    // failure, which is how CI runs it.
    const path = writeGoogleServices(dir, BUILD_PROJECT)
    const unreachable = 'http://127.0.0.1:9/graphql'
    const skipped = await runCheck({ GOOGLE_SERVICES_JSON: path, EXPO_API_URL: unreachable })
    expect(skipped.status).toBe(0)
    expect(skipped.stderr).toContain('SKIPPED')

    const strict = await runCheck({
      GOOGLE_SERVICES_JSON: path,
      EXPO_API_URL: unreachable,
      FCM_CHECK_STRICT: 'true',
    })
    expect(strict.status).toBe(1)
  })
})
