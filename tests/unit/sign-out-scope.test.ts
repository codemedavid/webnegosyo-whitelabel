import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { SIGN_OUT_SCOPE, signOutThisDevice } from '@/lib/supabase/sign-out'

/**
 * A global sign-out revokes every session the user holds, including the MCP
 * connector's OAuth session. With one shared superadmin account, one Logout
 * click logged out the whole team and the Claude connector. These tests lock
 * the narrower scope in, and stop a bare `auth.signOut()` from creeping back.
 */

const REPO_ROOT = join(__dirname, '..', '..')
const SRC_ROOT = join(REPO_ROOT, 'src')
const HELPER_PATH = join(SRC_ROOT, 'lib', 'supabase', 'sign-out.ts')

// The desktop POS shares the same Supabase project and accounts, so a global
// sign-out there (including the one on a failed login) kills web + MCP too.
const DESKTOP_SRC_ROOT = join(REPO_ROOT, 'webnegosyo-desktop', 'src')
const DESKTOP_HELPER_PATH = join(DESKTOP_SRC_ROOT, 'renderer', 'src', 'lib', 'sign-out.ts')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
}

describe('signOutThisDevice', () => {
  test('signs out with the local scope only', async () => {
    // Arrange
    const signOut = jest.fn().mockResolvedValue({ error: null })

    // Act
    await signOutThisDevice({ auth: { signOut } })

    // Assert
    expect(SIGN_OUT_SCOPE).toBe('local')
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  test('no source file calls auth.signOut directly outside the helper', () => {
    const offenders = sourceFiles(SRC_ROOT)
      .filter((file) => file !== HELPER_PATH)
      .filter((file) => /\.auth\.signOut\(/.test(readFileSync(file, 'utf8')))

    expect(offenders).toEqual([])
  })

  test('no desktop POS source file calls auth.signOut directly outside its helper', () => {
    const offenders = sourceFiles(DESKTOP_SRC_ROOT)
      .filter((file) => file !== DESKTOP_HELPER_PATH)
      .filter((file) => /\.auth\.signOut\(/.test(readFileSync(file, 'utf8')))

    expect(offenders).toEqual([])
  })

  test('the desktop POS helper signs out with the local scope', () => {
    const helper = readFileSync(DESKTOP_HELPER_PATH, 'utf8')

    expect(helper).toMatch(/signOut\(\{ scope: SIGN_OUT_SCOPE \}\)/)
    expect(helper).toMatch(/SIGN_OUT_SCOPE = 'local'/)
  })
})
