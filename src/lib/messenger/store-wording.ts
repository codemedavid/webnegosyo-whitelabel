/**
 * The store's Messenger Studio wording for texts the website sends (cart,
 * order summary). Never in the way of a send: any failure = undefined = the
 * built-in words.
 */

import 'server-only'
import type { MessageSettings } from './messages/registry'

export async function readStoreWording(tenantId: string): Promise<MessageSettings | undefined> {
  try {
    const { loadMessageSettings } = await import('./load-store')
    return await loadMessageSettings(tenantId)
  } catch (error) {
    console.error('[Messenger] store wording unavailable, using defaults:', error instanceof Error ? error.message : error)
    return undefined
  }
}
