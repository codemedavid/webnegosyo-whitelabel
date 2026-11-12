/**
 * What the Messenger Studio page hands the editor. Lives in lib so the server
 * loader (`editor-data.ts`) can type it without importing a component.
 */

import type { MessageSettings } from './messages/registry'
import type { OrderUpdatesConfig } from './order-view'
import type { MessengerRule } from './rules'
import type { ReplyStore } from './store-view'

export interface MessengerStudioProps {
  tenantId: string
  tenantSlug: string
  initialRules: MessengerRule[]
  /** False = the store still runs the built-in rules (shown as such until the first save). */
  isCustomized: boolean
  version: number
  botEnabled: boolean
  takeoverMinutes: number
  store: ReplyStore
  isPageConnected: boolean
  isTesterLinked: boolean
  profileError: string | null
  orderUpdates: OrderUpdatesConfig
  /** What the bot says (registry wording, status texts folded in). */
  messages: MessageSettings
  isPlatformOrders: boolean
}
