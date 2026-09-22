import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { SIGN_OUT_SCOPE, signOutThisDevice } from '@/lib/supabase/sign-out'

/**
 * A global sign-out revokes every session the user holds, including the MCP
 * connector's OAuth session. With one shared superadmin account, one Logout
 * click logged out the whole team and the Claude connector. These tests lock
 * the narrower scope in, and stop a bare `auth.signOut()` from creeping back.
 */

const SRC_ROOT = join(__dirname, '..', '..', 'src')
const HELPER_PATH = join(SRC_ROOT, 'lib', 'supabase', 'sign-out.ts')

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
})
