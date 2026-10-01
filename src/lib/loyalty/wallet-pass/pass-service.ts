/**
 * Wallet pass orchestration: render a member's card from the ledger, issue a
 * pass for a verified receipt, keep saved cards current, and resolve a scanned
 * card back to a member for the POS.
 *
 * Every read is service-role and keyed by the pass row, never by anything a
 * device or customer sends: the serial finds the row, the row names the
 * tenant, programme and customer.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getTenantBranding } from '@/lib/branding-utils'
import { loadActiveLoyaltyPrograms } from '../store'
import { readLoyaltyBalance } from '../balance-reads'
import { buildWalletPassContent, hashWalletPassContent, type WalletPassContent } from './content'
import { createPassSerial } from './member-code'
import type { WalletConfig } from './config'
import {
  ensurePass,
  findPassBySerial,
  forgetApplePushTokens,
  listApplePushTokens,
  recordPassContent,
  recordWalletWatermark,
  type WalletPassRow,
} from './pass-repository'
import { planPassSync } from './sync-plan'
import { pushApplePassUpdate } from './apple-push'
import { buildGoogleLoyaltyClass, buildGoogleLoyaltyObject, buildGoogleSaveClaims, googleWalletIds } from './google-objects'
import {
  buildGoogleSaveUrl,
  patchGoogleLoyaltyClass,
  patchGoogleLoyaltyObject,
  upsertGoogleLoyaltyCard,
} from './google-client'

export const PLATFORM_LOGO_PATH = '/webnegosyo-logo.png'

export interface RenderedPass {
  row: WalletPassRow
  content: WalletPassContent
  hash: string
}

interface TenantPassRow {
  name?: string | null
  slug?: string | null
  domain?: string | null
  logo_url?: string | null
  [key: string]: unknown
}

function storeUrlFor(tenant: TenantPassRow, publicBaseUrl: string): string | null {
  if (tenant.domain) return `https://${tenant.domain}/menu`
  return tenant.slug ? `${publicBaseUrl}/${tenant.slug}/menu` : null
}

async function readRewardExpiries(client: SupabaseClient, row: WalletPassRow): Promise<Array<string | null>> {
  const { data, error } = await client
    .from('loyalty_entitlements')
    .select('expires_at')
    .eq('tenant_id', row.tenant_id)
    .eq('program_id', row.program_id)
    .eq('customer_key', row.customer_key)
    .in('status', ['issued', 'restored'])
  if (error) throw new Error(`wallet pass rewards could not be read: ${error.message}`)
  return ((data ?? []) as Array<{ expires_at: string | null }>).map((reward) => reward.expires_at)
}

/** The card as it should look right now; null when its programme no longer exists. */
export async function renderPass(
  client: SupabaseClient,
  row: WalletPassRow,
  publicBaseUrl: string,
  nowMs: number = Date.now(),
): Promise<RenderedPass | null> {
  const [tenantResult, programs, balance, rewardExpiries] = await Promise.all([
    client.from('tenants').select('*').eq('id', row.tenant_id).maybeSingle(),
    loadActiveLoyaltyPrograms(client, row.tenant_id, { includeInactive: true }),
    readLoyaltyBalance(client, row.tenant_id, row.program_id, row.customer_key),
    readRewardExpiries(client, row),
  ])
  if (tenantResult.error) throw new Error(`wallet pass store could not be read: ${tenantResult.error.message}`)
  const tenant = tenantResult.data as TenantPassRow | null
  const program = programs.find((candidate) => candidate.id === row.program_id)
  if (!tenant || !program) return null

  const branding = getTenantBranding(tenant)
  const content = buildWalletPassContent({
    serial: row.serial_number,
    storeName: tenant.name?.trim() || 'Loyalty card',
    logoUrl: tenant.logo_url ?? null,
    storeUrl: storeUrlFor(tenant, publicBaseUrl),
    colors: { background: branding.buttonPrimary, text: branding.buttonPrimaryText },
    program,
    balance,
    rewardExpiries,
    nowMs,
  })
  return { row, content, hash: hashWalletPassContent(content) }
}

/** Renders the card and records it if it changed; returns the card and its modification time. */
export async function refreshPass(
  client: SupabaseClient,
  row: WalletPassRow,
  publicBaseUrl: string,
): Promise<{ rendered: RenderedPass; updatedAt: string } | null> {
  const rendered = await renderPass(client, row, publicBaseUrl)
  if (!rendered) return null
  const updatedAt = rendered.hash === row.content_hash
    ? row.content_updated_at
    : await recordPassContent(client, row.id, rendered.hash)
  return { rendered, updatedAt }
}

/** The member's pass for this programme (created on first request), rendered and recorded. */
export async function issuePass(
  client: SupabaseClient,
  member: { tenantId: string; programId: string; customerKey: string },
  publicBaseUrl: string,
): Promise<RenderedPass | null> {
  const row = await ensurePass(client, member, () => createPassSerial())
  return (await refreshPass(client, row, publicBaseUrl))?.rendered ?? null
}

export interface PassSyncReport {
  changed: boolean
  applePushed: number
  googleUpdated: boolean
}

/**
 * Bring every wallet holding this card up to date. Each wallet is attempted
 * independently; a failure in one is logged and leaves its watermark behind,
 * so the next change retries it.
 */
export async function syncPass(
  client: SupabaseClient,
  row: WalletPassRow,
  config: WalletConfig,
): Promise<PassSyncReport | null> {
  const rendered = await renderPass(client, row, config.publicBaseUrl)
  if (!rendered) return null

  const pushTokens = config.apple ? await listApplePushTokens(client, row.id) : []
  const plan = planPassSync({
    hash: rendered.hash,
    contentHash: row.content_hash,
    applePushedHash: row.apple_pushed_hash,
    googleSyncedHash: row.google_synced_hash,
    isAppleConfigured: Boolean(config.apple),
    isGoogleConfigured: Boolean(config.google),
    appleDeviceCount: pushTokens.length,
  })

  if (plan.recordContent) await recordPassContent(client, row.id, rendered.hash)
  const report: PassSyncReport = { changed: plan.recordContent, applePushed: 0, googleUpdated: false }

  if (plan.pushApple && config.apple) {
    try {
      const result = await pushApplePassUpdate(config.apple, pushTokens)
      await forgetApplePushTokens(client, row.id, result.goneTokens)
      report.applePushed = result.sent
      if (result.failed === 0) await recordWalletWatermark(client, row.id, 'apple', rendered.hash)
    } catch (error) {
      console.error('[wallet-pass] Apple push failed:', error instanceof Error ? error.message : error)
    }
  }

  if (plan.patchGoogle && config.google) {
    try {
      const ids = googleWalletIds(config.google.issuerId, row.program_id, row.serial_number)
      const outcome = await patchGoogleLoyaltyObject(config.google, buildGoogleLoyaltyObject(rendered.content, ids))
      // 404: the object is gone on Google's side; the next save link rewrites it.
      if (outcome === 'updated') report.googleUpdated = true
      await recordWalletWatermark(client, row.id, 'google', rendered.hash)
    } catch (error) {
      console.error('[wallet-pass] Google update failed:', error instanceof Error ? error.message : error)
    }
  }

  return report
}

/** Programme-level changes (name, branding) also live on the Google class. */
export async function syncGoogleClass(
  config: WalletConfig,
  rendered: RenderedPass,
): Promise<void> {
  if (!config.google) return
  const ids = googleWalletIds(config.google.issuerId, rendered.row.program_id, rendered.row.serial_number)
  try {
    await patchGoogleLoyaltyClass(config.google, buildGoogleLoyaltyClass(rendered.content, {
      classId: ids.classId,
      fallbackLogoUrl: `${config.publicBaseUrl}${PLATFORM_LOGO_PATH}`,
    }))
  } catch (error) {
    console.error('[wallet-pass] Google class update failed:', error instanceof Error ? error.message : error)
  }
}

/**
 * Writes the member's Google card (class + object) and returns the short
 * "Save to Google Wallet" link. Recording the watermark marks this member as
 * a Google holder, so later balance changes PATCH their card.
 */
export async function prepareGoogleSaveUrl(
  client: SupabaseClient,
  rendered: RenderedPass,
  config: WalletConfig,
): Promise<string | null> {
  if (!config.google) return null
  const ids = googleWalletIds(config.google.issuerId, rendered.row.program_id, rendered.row.serial_number)
  await upsertGoogleLoyaltyCard(
    config.google,
    buildGoogleLoyaltyClass(rendered.content, {
      classId: ids.classId,
      fallbackLogoUrl: `${config.publicBaseUrl}${PLATFORM_LOGO_PATH}`,
    }),
    buildGoogleLoyaltyObject(rendered.content, ids),
  )
  await recordWalletWatermark(client, rendered.row.id, 'google', rendered.hash)
  return buildGoogleSaveUrl(config.google, buildGoogleSaveClaims({
    serviceAccountEmail: config.google.serviceAccountEmail,
    origins: [config.publicBaseUrl],
    objectId: ids.objectId,
    issuedAtSeconds: Math.floor(Date.now() / 1000),
  }))
}

/**
 * The member behind a scanned card, for the POS. Only a card issued by THIS
 * store resolves: a serial from another tenant is "not found", never a
 * cross-store lookup.
 */
export async function identifyMemberBySerial(
  client: SupabaseClient,
  tenantId: string,
  serial: string,
): Promise<{ phoneE164: string; programId: string } | null> {
  const row = await findPassBySerial(client, serial)
  if (!row || row.tenant_id !== tenantId) return null
  const phone = row.customer_key.replace(/^phone:/, '')
  return /^\+[0-9]{8,15}$/.test(phone) ? { phoneE164: phone, programId: row.program_id } : null
}
