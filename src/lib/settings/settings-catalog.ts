/**
 * The Settings catalog — every thing a merchant can configure, grouped the way
 * they think about their store, and filtered to what THIS viewer may open.
 *
 * Two kinds of entry:
 * - a `section` lives under /admin/settings/<key> and holds the cards that
 *   used to be stacked on one long page;
 * - a `tool` is a full page elsewhere in the admin (Branding Studio, Payment
 *   methods…), listed here so Settings is the one place that answers "what
 *   can I set up?". Tools reuse the sidebar's own permission and feature-flag
 *   rules, so the two can never disagree about what a viewer is offered.
 *
 * Pure: no I/O, no React. The overview, the rail and every section page's
 * gate all read from here.
 */

import { hiddenAdminSidebarPaths, isHiddenAdminHref } from '@/lib/admin-sidebar-visibility'
import { permissionForAdminPath, type StaffPermissionKey } from '@/lib/staff-permissions'
import type { Tenant } from '@/types/database'

export const SETTINGS_SECTION_KEYS = [
  'store',
  'hours',
  'delivery',
  'messenger',
  'footer',
  'splash',
  'team',
  'account',
  'data',
] as const

export type SettingsSectionKey = (typeof SETTINGS_SECTION_KEYS)[number]

/** Icon names the UI maps to its icon set; kept as strings so this stays pure. */
export type SettingsIconKey =
  | 'store'
  | 'clock'
  | 'map-pin'
  | 'shopping-bag'
  | 'credit-card'
  | 'truck'
  | 'receipt'
  | 'qr-code'
  | 'message'
  | 'key'
  | 'paintbrush'
  | 'layout'
  | 'panel-bottom'
  | 'smartphone'
  | 'users'
  | 'user'
  | 'trash'

/** Who is looking — resolved once on the server from the signed-in account. */
export interface SettingsViewer {
  /** The store's owner, or a superadmin. */
  isOwner: boolean
  /** The store's owner exactly. Deleting orders is theirs alone. */
  isStoreOwner: boolean
  /** The owner, or a branch admin managing their own branch's people. */
  canManageAnyStaff: boolean
  /** True when the account runs one branch rather than the whole store. */
  isBranchScopedAccount: boolean
  hasPermission: (key: StaffPermissionKey) => boolean
}

/** The tenant columns the catalog reads — a narrow slice so tests stay small. */
export type SettingsTenantFacts = Pick<
  Tenant,
  | 'slug'
  | 'is_active'
  | 'operating_hours'
  | 'enforce_operating_hours'
  | 'distance_delivery_enabled'
  | 'lalamove_enabled'
  | 'facebook_page_id'
  | 'messenger_username'
  | 'footer_enabled'
  | 'flash_screen_feature_enabled'
  | 'flash_screen_is_active'
  | 'multi_branch_enabled'
> & { domain?: string | null }

export type SettingStatusTone = 'ok' | 'attention' | 'neutral' | 'off'

export interface SettingStatus {
  tone: SettingStatusTone
  label: string
}

export interface SettingsEntry {
  key: string
  title: string
  summary: string
  icon: SettingsIconKey
  kind: 'section' | 'tool'
  /** Tenant-prefixed. */
  href: string
  /** Present on sections only. */
  section?: SettingsSectionKey
}

export interface SettingsGroup {
  key: string
  title: string
  entries: SettingsEntry[]
}

interface CatalogContext {
  viewer: SettingsViewer
  tenant: SettingsTenantFacts
}

interface EntryDef {
  key: string
  title: string
  summary: string
  icon: SettingsIconKey
  target: { kind: 'section'; section: SettingsSectionKey } | { kind: 'tool'; path: string }
}

interface GroupDef {
  key: string
  title: string
  entries: readonly EntryDef[]
}

const section = (key: SettingsSectionKey, title: string, summary: string, icon: SettingsIconKey): EntryDef => ({
  key,
  title,
  summary,
  icon,
  target: { kind: 'section', section: key },
})

const tool = (key: string, title: string, summary: string, icon: SettingsIconKey, path: string): EntryDef => ({
  key,
  title,
  summary,
  icon,
  target: { kind: 'tool', path },
})

const CATALOG: readonly GroupDef[] = [
  {
    key: 'store',
    title: 'Your store',
    entries: [
      section('store', 'Store details', 'Your store name, web address and custom domain.', 'store'),
      section('hours', 'Opening hours', 'When you take orders, and whether the shop closes outside them.', 'clock'),
      tool('branches', 'Branches', 'Each location’s address, hours, menu and team.', 'map-pin', '/outlets'),
    ],
  },
  {
    key: 'orders',
    title: 'Orders & payments',
    entries: [
      tool('order-types', 'Order types', 'Dine-in, pickup, delivery — and what each one asks for.', 'shopping-bag', '/order-types'),
      tool('payment-methods', 'Payment methods', 'How customers pay, and whether they send proof.', 'credit-card', '/payment-methods'),
      section('delivery', 'Delivery & pickup', 'Distance-based fees, Lalamove riders and scan-to-collect.', 'truck'),
      tool('receipts', 'Receipt Studio', 'Design the printed receipt and its tracking QR.', 'receipt', '/receipt-editor'),
      tool('qr-codes', 'QR codes', 'Print codes for your store, each branch and every table.', 'qr-code', '/qr-codes'),
    ],
  },
  {
    key: 'connections',
    title: 'Messenger & connections',
    entries: [
      section('messenger', 'Messenger', 'Connect your Facebook Page and choose how orders reach you.', 'message'),
      tool('connect-ai', 'Connect AI', 'Let an AI assistant work on your store with a private key.', 'key', '/mcp'),
    ],
  },
  {
    key: 'storefront',
    title: 'Storefront',
    entries: [
      tool('branding', 'Branding Studio', 'Colours, menu cards, page layout and your welcome page.', 'paintbrush', '/branding'),
      tool('hero', 'Hero Builder', 'The banner at the top of your menu.', 'layout', '/hero-designer'),
      section('footer', 'Footer & pages', 'Contact details, social links, and your About, Terms and Privacy pages.', 'panel-bottom'),
      section('splash', 'Splash screen', 'What customers see while your app opens.', 'smartphone'),
    ],
  },
  {
    key: 'people',
    title: 'Team & account',
    entries: [
      section('team', 'Staff & permissions', 'Add team members and choose what each one can open.', 'users'),
      section('account', 'My account', 'Your sign-in email and password.', 'user'),
    ],
  },
  {
    key: 'data',
    title: 'Data',
    entries: [section('data', 'Delete orders', 'Clear test orders. You download a copy first and can restore them.', 'trash')],
  },
]

const SECTION_GATES: Record<SettingsSectionKey, (ctx: CatalogContext) => boolean> = {
  store: () => true,
  hours: ({ viewer }) => viewer.hasPermission('settings'),
  delivery: ({ viewer }) => viewer.hasPermission('settings'),
  messenger: ({ viewer }) => viewer.hasPermission('settings'),
  footer: ({ viewer }) => viewer.hasPermission('settings'),
  splash: ({ viewer, tenant }) => viewer.hasPermission('settings') && tenant.flash_screen_feature_enabled === true,
  team: ({ viewer }) => viewer.canManageAnyStaff,
  account: () => true,
  data: ({ viewer }) => viewer.isStoreOwner,
}

/** Whether a tool page is offered — the sidebar's permission AND feature-flag rules. */
function canOpenTool(path: string, { viewer, tenant }: CatalogContext): boolean {
  const required = permissionForAdminPath(`/admin${path}`)
  if (required !== null && !viewer.hasPermission(required)) return false

  const hidden = hiddenAdminSidebarPaths({
    multiBranchEnabled: tenant.multi_branch_enabled,
    isBranchScopedAccount: viewer.isBranchScopedAccount,
  })
  return !isHiddenAdminHref(`/admin${path}`, hidden)
}

function isEntryVisible(entry: EntryDef, ctx: CatalogContext): boolean {
  return entry.target.kind === 'section'
    ? SECTION_GATES[entry.target.section](ctx)
    : canOpenTool(entry.target.path, ctx)
}

function resolveEntry(entry: EntryDef, tenantSlug: string): SettingsEntry {
  const base = { key: entry.key, title: entry.title, summary: entry.summary, icon: entry.icon }
  if (entry.target.kind === 'section') {
    return {
      ...base,
      kind: 'section',
      section: entry.target.section,
      href: `/${tenantSlug}/admin/settings/${entry.target.section}`,
    }
  }
  return { ...base, kind: 'tool', href: `/${tenantSlug}/admin${entry.target.path}` }
}

/** Every group and entry this viewer is offered, in display order. Empty groups are dropped. */
export function buildSettingsCatalog(input: CatalogContext & { tenantSlug: string }): SettingsGroup[] {
  return CATALOG.map((group) => ({
    key: group.key,
    title: group.title,
    entries: group.entries
      .filter((entry) => isEntryVisible(entry, input))
      .map((entry) => resolveEntry(entry, input.tenantSlug)),
  })).filter((group) => group.entries.length > 0)
}

/** The gate a section page applies before rendering. Agrees with the catalog by construction. */
export function canOpenSettingsSection(key: SettingsSectionKey, ctx: CatalogContext): boolean {
  return SECTION_GATES[key](ctx)
}

/** A section's title and one-line summary — the same words the overview shows. */
export function settingsSectionMeta(key: SettingsSectionKey): { title: string; summary: string } {
  for (const group of CATALOG) {
    for (const entry of group.entries) {
      if (entry.target.kind === 'section' && entry.target.section === key) {
        return { title: entry.title, summary: entry.summary }
      }
    }
  }
  throw new Error(`Unknown settings section: ${key}`)
}

export function isSettingsSectionKey(value: string): value is SettingsSectionKey {
  return (SETTINGS_SECTION_KEYS as readonly string[]).includes(value)
}

/** Pages that live under /settings but belong to a section's rail entry. */
const SUB_PAGE_SECTIONS: Readonly<Record<string, SettingsSectionKey>> = {
  'delete-orders': 'data',
}

/** The section a pathname belongs to, or null for the overview and anything else. */
export function settingsSectionForPath(pathname: string): SettingsSectionKey | null {
  const match = /\/admin\/settings\/([^/?#]+)/.exec(pathname)
  if (!match) return null
  const segment = match[1]
  if (isSettingsSectionKey(segment)) return segment
  return SUB_PAGE_SECTIONS[segment] ?? null
}

function hasOpenDay(hours: SettingsTenantFacts['operating_hours']): boolean {
  if (!hours) return false
  return Object.values(hours).some((day) => day && day.closed !== true)
}

function deliveryStatus(tenant: SettingsTenantFacts): SettingStatus {
  const enabled = [
    tenant.distance_delivery_enabled ? 'Distance fee' : null,
    tenant.lalamove_enabled ? 'Lalamove' : null,
  ].filter((part): part is string => part !== null)

  return enabled.length > 0
    ? { tone: 'ok', label: enabled.join(' · ') }
    : { tone: 'neutral', label: 'Distance fee off' }
}

/**
 * The one-line state shown beside a section, or null when its state only
 * makes sense inside it. `attention` marks something a store should finish.
 */
export function describeSectionStatus(
  key: SettingsSectionKey,
  tenant: SettingsTenantFacts,
  extras: { accountEmail?: string | null }
): SettingStatus | null {
  switch (key) {
    case 'store':
      if (!tenant.is_active) return { tone: 'attention', label: 'Offline' }
      return { tone: 'ok', label: tenant.domain ? `Live · ${tenant.domain}` : 'Live' }
    case 'hours':
      if (!hasOpenDay(tenant.operating_hours)) return { tone: 'attention', label: 'Not set' }
      return tenant.enforce_operating_hours === true
        ? { tone: 'ok', label: 'Closes after hours' }
        : { tone: 'ok', label: 'Set' }
    case 'delivery':
      return deliveryStatus(tenant)
    case 'messenger':
      if (tenant.facebook_page_id) return { tone: 'ok', label: 'Page connected' }
      if (tenant.messenger_username) return { tone: 'neutral', label: 'Username only' }
      return { tone: 'attention', label: 'Not connected' }
    case 'footer':
      return tenant.footer_enabled === false ? { tone: 'off', label: 'Hidden' } : { tone: 'ok', label: 'Shown' }
    case 'splash':
      return tenant.flash_screen_is_active ? { tone: 'ok', label: 'On' } : { tone: 'off', label: 'Off' }
    case 'account':
      return extras.accountEmail ? { tone: 'neutral', label: extras.accountEmail } : null
    case 'team':
    case 'data':
      return null
  }
}
