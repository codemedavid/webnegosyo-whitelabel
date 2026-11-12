/** The real side effects behind `handleEvent`. */

import 'server-only'
import { messengerDb } from './service-db'
import { getActivePageByPageId } from '@/lib/facebook/page-tokens'
import { claimEventOnce } from './dedupe'
import type { WebhookDeps } from './handle-event'
import { createMessengerLinkToken } from './link-token'
import { loadMessengerSettingsAndRules, loadStoreBundle } from './load-store'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { answerOrderReferral } from './order-referral-reply'
import { BOT_METADATA, maskPsid, sendMessages } from './send'
import { setBotPause, touchSession } from './session'
import { changeChatCart } from './chat-cart-store'
import { loadRecentOrders } from './recent-orders'
import { refreshCustomerProfile, writeChatLog } from './chat-log-store'

/** Store the owner's PSID as the test recipient and spend the code. */
async function linkTester(tenantId: string, psid: string): Promise<boolean> {
  const { data, error } = await messengerDb()
    .from('messenger_settings')
    .update({ tester_psid: psid, tester_code_hash: null, tester_code_expires_at: null } as never)
    .eq('tenant_id', tenantId)
    .not('tester_code_hash', 'is', null)
    .select('tenant_id')
  if (error || !data || data.length !== 1) {
    console.error('[Messenger] tester not linked', { tenantId, psid: maskPsid(psid), code: error?.code })
    return false
  }
  return true
}

export function createWebhookDeps(): WebhookDeps {
  return {
    ourAppId: process.env.FACEBOOK_APP_ID?.trim() || null,
    botMetadata: BOT_METADATA,
    now: () => new Date(),
    claimOnce: claimEventOnce,
    findPage: async (pageId) => {
      const page = await getActivePageByPageId(pageId)
      return page ? { tenantId: page.tenant_id, token: page.page_access_token } : null
    },
    loadBundle: loadStoreBundle,
    loadTakeoverMinutes: async (tenantId) => (await loadMessengerSettingsAndRules(tenantId)).settings.takeoverMinutes,
    allowTesterAttempt: async (tenantId) =>
      (await checkRateLimit(`msgr-tester:${tenantId}`, { limit: 10, windowSec: 600, onRedisFailure: 'instance' })).allowed,
    touchSession,
    setBotPause,
    send: sendMessages,
    answerOrderReferral,
    createLinkToken: (sessionId) => createMessengerLinkToken(sessionId),
    linkTester,
    changeCart: changeChatCart,
    loadRecentOrders,
    logChat: writeChatLog,
    refreshProfile: (input) => refreshCustomerProfile(input),
  }
}
