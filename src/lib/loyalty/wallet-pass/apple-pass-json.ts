/**
 * `pass.json` for an Apple Wallet store card, from the shared pass content.
 *
 * Pure. Signing and zipping live in `apple-pkpass.ts`. The fields that carry a
 * `changeMessage` are the ones a customer should hear about: when the balance
 * or the headline changes after a push, Wallet shows that message on the lock
 * screen ("You now have 8 / 10 stamps").
 */

import type { WalletPassContent } from './content'

export interface ApplePassField {
  key: string
  label?: string
  value: string | number
  changeMessage?: string
  dateStyle?: 'PKDateStyleShort' | 'PKDateStyleMedium' | 'PKDateStyleLong'
  textAlignment?: 'PKTextAlignmentLeft' | 'PKTextAlignmentRight' | 'PKTextAlignmentNatural'
  attributedValue?: string
}

export interface ApplePassJson {
  formatVersion: 1
  passTypeIdentifier: string
  teamIdentifier: string
  serialNumber: string
  authenticationToken: string
  webServiceURL: string
  organizationName: string
  description: string
  logoText: string
  backgroundColor: string
  foregroundColor: string
  labelColor: string
  sharingProhibited: boolean
  barcodes: Array<{ format: 'PKBarcodeFormatQR'; message: string; messageEncoding: 'iso-8859-1'; altText: string }>
  storeCard: {
    headerFields: ApplePassField[]
    primaryFields: ApplePassField[]
    secondaryFields: ApplePassField[]
    auxiliaryFields: ApplePassField[]
    backFields: ApplePassField[]
  }
}

export interface ApplePassOptions {
  passTypeIdentifier: string
  teamIdentifier: string
  webServiceURL: string
  authenticationToken: string
}

/** Wallet renders `attributedValue` as a small HTML subset; merchant text must not become markup. */
export function escapeAttributedText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function hexToAppleRgb(hex: string): string {
  const channel = (offset: number) => parseInt(hex.slice(offset, offset + 2), 16)
  return `rgb(${channel(1)}, ${channel(3)}, ${channel(5)})`
}

function backFields(content: WalletPassContent): ApplePassField[] {
  const unit = content.earnMode === 'stamp' ? 'a stamp' : 'points'
  const fields: ApplePassField[] = [
    { key: 'progress', label: 'Progress', value: `${content.balanceText} — ${content.remainingText}` },
    {
      key: 'how',
      label: 'How it works',
      value: `Show this card at the counter, or order online with the same phone number, to collect ${unit}. Reach the goal and you get: ${content.rewardLabel}.`,
    },
  ]
  fields.push({ key: 'programme_name', label: 'Programme', value: content.programName })
  if (content.statusNote) fields.push({ key: 'status', label: 'Programme status', value: content.statusNote })
  if (content.storeUrl) {
    fields.push({
      key: 'store',
      label: 'Order online',
      value: content.storeUrl,
      attributedValue: `<a href="${escapeAttributedText(content.storeUrl)}">${escapeAttributedText(content.storeName)}</a>`,
    })
  }
  fields.push({ key: 'member', label: 'Member code', value: content.serial.slice(-8).toUpperCase() })
  return fields
}

function expiryField(content: WalletPassContent): ApplePassField[] {
  if (!content.nextRewardExpiresAt) return []
  return [{
    key: 'expires',
    label: 'REWARD EXPIRES',
    value: content.nextRewardExpiresAt,
    dateStyle: 'PKDateStyleMedium',
    textAlignment: 'PKTextAlignmentRight',
  }]
}

function headlineChangeMessage(content: WalletPassContent): string {
  return content.rewardsAvailable > 0 ? 'Reward ready: %@' : 'Next reward: %@'
}

/**
 * A stamp card: the strip image is the punch grid, so nothing is drawn over
 * it. One line under the grid says what the stamps are for — or, once a
 * reward is waiting, what is ready.
 */
function stampCardFields(content: WalletPassContent): Pick<ApplePassJson['storeCard'], 'primaryFields' | 'secondaryFields' | 'auxiliaryFields'> {
  const isReady = content.rewardsAvailable > 0
  return {
    primaryFields: [],
    secondaryFields: [{
      key: 'headline',
      label: isReady ? 'REWARD READY' : 'OFFER',
      value: isReady ? content.headline.value : content.offerText,
      changeMessage: isReady ? headlineChangeMessage(content) : '%@',
    }],
    auxiliaryFields: expiryField(content),
  }
}

/** Points (or a card too long for a grid): the next reward is the big line. */
function headlineFields(content: WalletPassContent): Pick<ApplePassJson['storeCard'], 'primaryFields' | 'secondaryFields' | 'auxiliaryFields'> {
  return {
    primaryFields: [{
      key: 'headline',
      label: content.headline.label,
      value: content.headline.value,
      changeMessage: headlineChangeMessage(content),
    }],
    secondaryFields: [
      { key: 'remaining', label: 'TO GO', value: content.remainingText },
      { key: 'rewards', label: 'REWARDS', value: content.rewardsAvailable, textAlignment: 'PKTextAlignmentRight' },
    ],
    auxiliaryFields: [{ key: 'programme', label: 'PROGRAMME', value: content.programName }, ...expiryField(content)],
  }
}

export function buildApplePassJson(content: WalletPassContent, options: ApplePassOptions): ApplePassJson {
  const unit = content.balanceLabel.toLowerCase()

  return {
    formatVersion: 1,
    passTypeIdentifier: options.passTypeIdentifier,
    teamIdentifier: options.teamIdentifier,
    serialNumber: content.serial,
    authenticationToken: options.authenticationToken,
    webServiceURL: options.webServiceURL,
    organizationName: content.storeName,
    description: content.description,
    logoText: content.storeName,
    backgroundColor: hexToAppleRgb(content.colors.background),
    foregroundColor: hexToAppleRgb(content.colors.foreground),
    labelColor: hexToAppleRgb(content.colors.foreground),
    // A loyalty card is personal: sharing it would let a friend collect on it.
    sharingProhibited: true,
    barcodes: [{
      format: 'PKBarcodeFormatQR',
      message: content.memberCode,
      messageEncoding: 'iso-8859-1',
      altText: content.serial.slice(-8).toUpperCase(),
    }],
    storeCard: {
      headerFields: [{
        key: 'balance',
        label: content.balanceLabel,
        value: content.balanceText,
        changeMessage: `You now have %@ ${unit}`,
        textAlignment: 'PKTextAlignmentRight',
      }],
      ...(content.stampCard ? stampCardFields(content) : headlineFields(content)),
      backFields: backFields(content),
    },
  }
}
