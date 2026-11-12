import { AppApiError } from '@/lib/api/app-client'
import { useSession } from '@/lib/stores/session'

/**
 * Runs a call as the signed-in customer. A session the store refuses
 * (expired, revoked elsewhere) is handed to the one sign-out handler
 * `account-actions` registers, so every per-customer call signs out the same way.
 */
type RefusedHandler = () => Promise<void>

let onRefused: RefusedHandler | null = null

export function setSessionRefusedHandler(handler: RefusedHandler | null): void {
  onRefused = handler
}

export const SIGN_IN_AGAIN = 'Please sign in again.'

export async function withSession<T>(run: (token: string) => Promise<T>): Promise<T> {
  const { token } = useSession.getState()
  if (!token) throw new AppApiError('unauthorized', SIGN_IN_AGAIN)
  try {
    return await run(token)
  } catch (error) {
    // Only when it is still the same session: a newer sign-in must not be undone by an old call.
    if (error instanceof AppApiError && error.code === 'unauthorized' && useSession.getState().token === token && onRefused) await onRefused()
    throw error
  }
}
