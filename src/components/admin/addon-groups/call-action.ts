import { toast } from 'sonner'
import { runServerAction } from '@/components/admin/server-action-safety'

interface ActionReply<T> {
  success: boolean
  data?: T
  error?: string
}

/**
 * Run a Server Action that answers `{ success, data, error }`. Never rejects:
 * every failure (a refusal or a dropped request) is toasted and returns null.
 */
export async function callAction<T>(invoke: () => Promise<ActionReply<T>>, fallbackError: string): Promise<T | null> {
  const outcome = await runServerAction(invoke)
  if (!outcome.ok) {
    toast.error(outcome.message)
    return null
  }
  if (!outcome.value.success || outcome.value.data === undefined) {
    toast.error(outcome.value.error ?? fallbackError)
    return null
  }
  return outcome.value.data
}
