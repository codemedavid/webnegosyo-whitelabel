// Merchant settings for reward-code delivery: is a gateway phone online right
// now, does the store have a Semaphore fallback on file, and must customers
// verify their number by SMS before the rewards page shows anything?
//
// Reading status and the verify-first switch need loyalty access (the switch
// only changes who may look, never what anyone earns); changing the fallback is owner-only,
// like enrolling a phone, because the key spends the owner's own credits. The
// key is write-only from here: it is verified against Semaphore before it is
// stored and is never returned.
import 'server-only'
import type { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageStaff, hasPermission } from '@/lib/staff-permissions'
import { getLoyaltySmsFallback, setLoyaltySmsFallback } from '@/lib/tenant-secrets'
import { authenticateMerchant, hasExactKeys, isUuid, readBody, respond, unavailable } from './merchant-http'
import { readGatewayStatus } from './otp-delivery'
import { isSemaphoreApiKey, isSemaphoreSenderName, verifySemaphoreKey } from './semaphore'
import { readWalletOtpRequired, setWalletOtpRequired, type StoreSettingsClient } from './store-settings'

const UNAVAILABLE = 'SMS settings could not be loaded. Try again.'
const isStatus = (value: unknown) => value === 'status'
const isClear = (value: unknown) => value === 'clear_fallback'
const isSave = (value: unknown) => value === 'save_fallback'
const isSetWallet = (value: unknown) => value === 'set_wallet_verification'
const isBoolean = (value: unknown) => typeof value === 'boolean'
const isSenderOrNull = (value: unknown) => value === null || isSemaphoreSenderName(value)

export async function handleSmsGatewaySettings(request: NextRequest): Promise<NextResponse> {
  if (process.env.LOYALTY_SMS_DELIVERY_ENABLED !== 'true') {
    return respond({ error: 'Loyalty SMS delivery is not available yet.' }, 503)
  }
  const body = await readBody(request)
  const valid =
    hasExactKeys(body, { tenantId: isUuid, action: isStatus }) ||
    hasExactKeys(body, { tenantId: isUuid, action: isClear }) ||
    hasExactKeys(body, { tenantId: isUuid, action: isSetWallet, enabled: isBoolean }) ||
    hasExactKeys(body, { tenantId: isUuid, action: isSave, apiKey: isSemaphoreApiKey, senderName: isSenderOrNull })
  if (!valid) return respond({ error: 'Check the API key and sender name (up to 11 letters or digits).' }, 400)
  const fields = body as Record<string, unknown>
  const tenantId = (fields.tenantId as string).toLowerCase()
  const auth = await authenticateMerchant(request, tenantId)
  if (!auth.ok) return auth.response
  const action = fields.action
  const allowed = action === 'status' || action === 'set_wallet_verification'
    ? hasPermission(auth.member, 'loyalty_manage')
    : canManageStaff(auth.member)
  if (!allowed) return respond({ error: 'Forbidden' }, 403)
  try {
    const database = createAdminClient()
    if (action === 'status') return await status(database, tenantId)
    if (action === 'set_wallet_verification') {
      const enabled = fields.enabled as boolean
      await setWalletOtpRequired(settingsClient(database), tenantId, enabled)
      return respond({ success: true, walletVerification: enabled }, 200)
    }
    if (action === 'clear_fallback') {
      await setLoyaltySmsFallback(database, tenantId, null)
      return respond({ success: true }, 200)
    }
    const apiKey = fields.apiKey as string
    const check = await verifySemaphoreKey(apiKey)
    if (!check.ok) {
      return check.reason === 'invalid_key'
        ? respond({ error: 'Semaphore did not accept this API key. Copy it again from your Semaphore dashboard.' }, 400)
        : unavailable('Could not reach Semaphore to check the key. Try again.')
    }
    await setLoyaltySmsFallback(database, tenantId, { apiKey, senderName: (fields.senderName as string | null) ?? null })
    return respond({ success: true }, 200)
  } catch {
    return unavailable(UNAVAILABLE)
  }
}

async function status(database: ReturnType<typeof createAdminClient>, tenantId: string): Promise<NextResponse> {
  const [gateway, fallback, walletVerification] = await Promise.all([
    readGatewayStatus(database, tenantId),
    getLoyaltySmsFallback(database, tenantId),
    readWalletOtpRequired(settingsClient(database), tenantId),
  ])
  if (!gateway) return unavailable(UNAVAILABLE)
  return respond({
    ...gateway,
    fallback: { configured: fallback !== null, senderName: fallback?.senderName ?? null },
    walletVerification,
  }, 200)
}

// The settings table is newer than the generated types.
function settingsClient(database: ReturnType<typeof createAdminClient>): StoreSettingsClient {
  return database as unknown as StoreSettingsClient
}
