/**
 * Where a printed QR code sends the guest.
 *
 * A printed code outlives every deploy, so its URL must be one the storefront
 * will keep answering: the store's own menu, with the same `?table=` and
 * `?outlet=` the merchant app's table codes already use (webnegosyo-app
 * lib/tables/table-qr.ts). The menu reads both — the table into checkout's
 * Table Number field (`table-qr-param.ts`), the branch into outlet selection.
 */

import { normalizeTableNumber } from '@/lib/order-table-number'
import { TABLE_QUERY_PARAM } from '@/lib/table-qr-param'

/** The branch query the menu resolves (see `outlets/deep-link.ts`). */
export const OUTLET_QUERY_PARAM = 'outlet'

export type StoreAddressKey = 'custom-domain' | 'platform'

export interface StoreAddress {
  key: StoreAddressKey
  /** What the merchant sees in the picker, without the protocol. */
  label: string
  /** Absolute, no trailing slash; the menu path is appended to it. */
  baseUrl: string
}

export interface StoreAddressInput {
  slug: string
  /** `tenants.domain` — only ever a verified custom domain. */
  domain: string | null
  /** `PLATFORM_ROOT_DOMAIN` (`webnegosyo.com`), null outside production. */
  rootDomain: string | null
  /** Absolute origin of the app, used path-based when there is no root domain. */
  appUrl: string | null
}

const HOSTNAME_PATTERN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

function cleanDomain(raw: string | null): string | null {
  if (!raw) return null
  const host = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  return HOSTNAME_PATTERN.test(host) ? host : null
}

function cleanOrigin(raw: string | null): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.origin
  } catch {
    return null
  }
}

/**
 * Every web address the store answers on, the one a printed code should use
 * first. A custom domain reads best on a table tent, but the platform address
 * keeps working if the domain is ever dropped — so both are offered.
 */
export function listStoreAddresses(input: StoreAddressInput): StoreAddress[] {
  const addresses: StoreAddress[] = []

  const domain = cleanDomain(input.domain)
  if (domain) addresses.push({ key: 'custom-domain', label: domain, baseUrl: `https://${domain}` })

  const rootDomain = cleanDomain(input.rootDomain)
  if (rootDomain) {
    const host = `${input.slug}.${rootDomain}`
    addresses.push({ key: 'platform', label: host, baseUrl: `https://${host}` })
    return addresses
  }

  const origin = cleanOrigin(input.appUrl)
  if (origin) {
    const baseUrl = `${origin}/${encodeURIComponent(input.slug)}`
    addresses.push({ key: 'platform', label: baseUrl.replace(/^https?:\/\//, ''), baseUrl })
  }
  return addresses
}

export interface QrTarget {
  /** The branch this code belongs to, for a multi-branch store. */
  outletSlug?: string | null
  /** The table this code sits on. */
  tableLabel?: string | null
}

export function buildQrTargetUrl(baseUrl: string, target: QrTarget): string {
  const query: string[] = []
  const table = target.tableLabel ? normalizeTableNumber(target.tableLabel) : ''
  if (table) query.push(`${TABLE_QUERY_PARAM}=${encodeURIComponent(table)}`)
  if (target.outletSlug) query.push(`${OUTLET_QUERY_PARAM}=${encodeURIComponent(target.outletSlug)}`)
  const menu = `${baseUrl.replace(/\/+$/, '')}/menu`
  return query.length > 0 ? `${menu}?${query.join('&')}` : menu
}
