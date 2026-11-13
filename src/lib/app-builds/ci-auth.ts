import 'server-only'
import { bearerBuildToken, isCiSecret } from './pipeline'
import { appBuildsDb, findCiBuild, type CiBuild } from './service'

/**
 * The build workflow's credential for `/api/app-builds/{manifest,report}`:
 * BOTH the CI secret (`x-app-build-secret`, a GitHub Actions secret) and the
 * build's one-time token (`Authorization: Bearer wnbt_…`). The token alone is
 * visible in the public run's inputs, so it never opens anything by itself
 * (see pipeline.ts). Returns the open, unexpired build, or null to refuse.
 */
export async function verifyBuildCaller(request: Request): Promise<CiBuild | null> {
  if (!isCiSecret(request.headers.get('x-app-build-secret'))) return null
  const token = bearerBuildToken(request.headers.get('authorization'))
  if (!token) return null
  return findCiBuild(appBuildsDb(), token)
}
