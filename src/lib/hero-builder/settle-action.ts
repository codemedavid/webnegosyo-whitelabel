// A server action call that always settles to a result. A request that never
// answers (offline, a deploy mid-save, a thrown action) rejects, and inside an
// async React 19 transition a rejection goes to the error boundary: the editor
// would be replaced by the error page, unsaved work and all. Editors await
// this instead and show the failure like any refused save.

export const ACTION_UNREACHABLE = 'Could not reach the store. Check your connection and try again.'

export interface ActionFailure {
  success: false
  error: string
}

export async function settleAction<T>(call: () => Promise<T>, label: string): Promise<T | ActionFailure> {
  try {
    return await call()
  } catch (error) {
    console.error(`[${label}] Request failed:`, error)
    return { success: false, error: ACTION_UNREACHABLE }
  }
}
