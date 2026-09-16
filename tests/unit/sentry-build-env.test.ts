/** @jest-environment node */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

it('blocks a deployment without the browser Sentry DSN, without printing secrets', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'sentry-build-env-'))
  const script = resolve('scripts/validate-env.mjs')
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    PATH: process.env.PATH,
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-key',
    NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/test',
    NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY: 'test-public',
    IMAGEKIT_PRIVATE_KEY: 'private-must-not-be-printed',
  }
  try {
    const result = spawnSync(process.execPath, [script], { cwd, env, encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('NEXT_PUBLIC_SENTRY_DSN')
    expect(result.stderr).not.toContain(env.IMAGEKIT_PRIVATE_KEY)
    expect(() => execFileSync(process.execPath, [script], {
      cwd, env: { ...env, NEXT_PUBLIC_SENTRY_DSN: 'https://public@example.ingest.sentry.io/123' },
      stdio: 'pipe',
    })).not.toThrow()
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})
