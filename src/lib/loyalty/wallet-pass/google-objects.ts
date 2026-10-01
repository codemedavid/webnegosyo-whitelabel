/**
 * Google Wallet loyalty class/object JSON, from the shared pass content.
 *
 * Pure. One class per loyalty programme (the store's branding + programme
 * name), one object per member (their balance + QR). Both are written through
 * the REST API before the customer is sent to Google (`google-client.ts`), so
 * the "Save to Google Wallet" JWT only names the object — a JWT carrying the
 * full objects makes a URL too long for some browsers and Android intents.
 */

import type { WalletPassContent } from './content'

export interface GoogleWalletIds {
  classId: string
  objectId: string
}

export interface GoogleLoyaltyClass {
  id: string
  issuerName: string
  programName: string
  programLogo: { sourceUri: { uri: string } }
  reviewStatus: 'UNDER_REVIEW'
  hexBackgroundColor: string
  countryCode: string
}

export interface GoogleLoyaltyObject {
  id: string
  classId: string
  state: 'ACTIVE' | 'INACTIVE'
  accountId: string
  hexBackgroundColor: string
  loyaltyPoints: { label: string; balance: { string: string } }
  secondaryLoyaltyPoints: { label: string; balance: { int: number } }
  barcode: { type: 'QR_CODE'; value: string; alternateText: string }
  textModulesData: Array<{ id: string; header: string; body: string }>
  linksModuleData?: { uris: Array<{ id: string; uri: string; description: string }> }
}

export interface GoogleSaveClaims {
  iss: string
  aud: 'google'
  typ: 'savetowallet'
  iat: number
  origins: string[]
  payload: { loyaltyObjects: Array<{ id: string }> }
}

export function googleWalletIds(issuerId: string, programId: string, serial: string): GoogleWalletIds {
  return {
    classId: `${issuerId}.wn_program_${programId.replace(/-/g, '')}`,
    objectId: `${issuerId}.wn_member_${serial}`,
  }
}

export function buildGoogleLoyaltyClass(
  content: WalletPassContent,
  options: { classId: string; fallbackLogoUrl: string },
): GoogleLoyaltyClass {
  return {
    id: options.classId,
    issuerName: content.storeName,
    programName: content.programName,
    programLogo: { sourceUri: { uri: content.logoUrl ?? options.fallbackLogoUrl } },
    reviewStatus: 'UNDER_REVIEW',
    hexBackgroundColor: content.colors.background,
    countryCode: 'PH',
  }
}

function textModules(content: WalletPassContent): GoogleLoyaltyObject['textModulesData'] {
  const modules = [
    { id: 'headline', header: content.headline.label === 'REWARDS READY' ? 'Rewards ready' : 'Next reward', body: content.headline.value },
    { id: 'remaining', header: 'To go', body: content.remainingText },
  ]
  if (content.nextRewardExpiresAt) {
    modules.push({ id: 'expires', header: 'Reward expires', body: content.nextRewardExpiresAt.slice(0, 10) })
  }
  if (content.statusNote) modules.push({ id: 'status', header: 'Programme status', body: content.statusNote })
  return modules
}

export function buildGoogleLoyaltyObject(content: WalletPassContent, ids: GoogleWalletIds): GoogleLoyaltyObject {
  const memberRef = content.serial.slice(-8).toUpperCase()
  return {
    id: ids.objectId,
    classId: ids.classId,
    state: content.programStatus === 'ended' ? 'INACTIVE' : 'ACTIVE',
    accountId: memberRef,
    hexBackgroundColor: content.colors.background,
    loyaltyPoints: {
      label: content.earnMode === 'stamp' ? 'Stamps' : 'Points',
      balance: { string: content.balanceText },
    },
    secondaryLoyaltyPoints: { label: 'Rewards', balance: { int: content.rewardsAvailable } },
    barcode: { type: 'QR_CODE', value: content.memberCode, alternateText: memberRef },
    textModulesData: textModules(content),
    ...(content.storeUrl
      ? { linksModuleData: { uris: [{ id: 'store', uri: content.storeUrl, description: `Order from ${content.storeName}` }] } }
      : {}),
  }
}

export function buildGoogleSaveClaims(input: {
  serviceAccountEmail: string
  origins: string[]
  objectId: string
  issuedAtSeconds: number
}): GoogleSaveClaims {
  return {
    iss: input.serviceAccountEmail,
    aud: 'google',
    typ: 'savetowallet',
    iat: input.issuedAtSeconds,
    origins: input.origins,
    payload: { loyaltyObjects: [{ id: input.objectId }] },
  }
}
