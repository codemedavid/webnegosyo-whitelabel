/**
 * Every Texts state is a URL: the tab, the list filter and each sheet. Unknown
 * values fall back to the default rather than erroring, so an old link still
 * opens the page. Pure.
 */

import { RECIPE_IDS } from '@/lib/sms-automations/types'
import type { RecipeId, TextsTab } from '../types'
import { findPreset } from './presets'

export type CampaignFilter = 'all' | 'active' | 'drafts' | 'done' | 'archived'
export type ActivityShow = 'all' | 'waiting' | 'sent' | 'not_sent'
export type RulesFocus = 'review_link' | 'quiet_hours'

export interface TextsUrlState {
  tab: TextsTab
  filter: CampaignFilter
  /** 'new' or a campaign id. */
  campaign: string | null
  preset: string | null
  edit: boolean
  /** `view=report`: open the report even for a campaign that would open in the editor. */
  isReport: boolean
  phones: boolean
  phone: string | null
  automatic: RecipeId | null
  show: ActivityShow
  /** 'campaigns' | 'automatic' | 'campaign:<id>' | 'auto:<recipe>'. */
  from: string | null
  focus: RulesFocus | null
}

export const DEFAULT_URL_STATE: TextsUrlState = {
  tab: 'campaigns', filter: 'all', campaign: null, preset: null, edit: false, isReport: false, phones: false, phone: null,
  automatic: null, show: 'all', from: null, focus: null,
}

const TABS: readonly TextsTab[] = ['campaigns', 'automatic', 'activity', 'rules']
const FILTERS: readonly CampaignFilter[] = ['all', 'active', 'drafts', 'done', 'archived']
const SHOWS: readonly ActivityShow[] = ['all', 'waiting', 'sent', 'not_sent']
const FOCUSES: readonly RulesFocus[] = ['review_link', 'quiet_hours']
export const BLANK_PRESET = 'blank'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Params = Pick<URLSearchParams, 'get'>

function oneOf<T extends string>(value: string | null, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback
}

export function isRecipeId(value: string | null): value is RecipeId {
  return (RECIPE_IDS as readonly string[]).includes(value ?? '')
}

function parseFrom(value: string | null): string | null {
  if (value === 'campaigns' || value === 'automatic') return value
  if (value?.startsWith('campaign:') && UUID.test(value.slice('campaign:'.length))) return value
  if (value?.startsWith('auto:') && isRecipeId(value.slice('auto:'.length))) return value
  return null
}

/** A real preset id, or 'blank' (the chooser's "Blank text"). */
function isPresetParam(value: string | null): boolean {
  return value === BLANK_PRESET || findPreset(value) !== null
}

export function parseTextsParams(params: Params): TextsUrlState {
  const automaticRaw = params.get('automatic')
  const automatic = isRecipeId(automaticRaw) ? automaticRaw : null
  const campaignRaw = params.get('campaign')
  const campaign = campaignRaw === 'new' || (campaignRaw && UUID.test(campaignRaw)) ? campaignRaw : null
  const phone = params.get('phone')
  return {
    tab: automatic ? 'automatic' : oneOf(params.get('tab'), TABS, 'campaigns'),
    filter: oneOf(params.get('filter'), FILTERS, 'all'),
    campaign,
    preset: campaign === 'new' && isPresetParam(params.get('preset')) ? params.get('preset') : null,
    edit: campaign !== null && campaign !== 'new' && params.get('edit') === '1',
    isReport: campaign !== null && campaign !== 'new' && params.get('view') === 'report',
    phones: params.get('phones') === '1',
    phone: params.get('phones') === '1' && phone && UUID.test(phone) ? phone : null,
    automatic,
    show: oneOf(params.get('show'), SHOWS, 'all'),
    from: parseFrom(params.get('from')),
    focus: FOCUSES.includes(params.get('focus') as RulesFocus) ? (params.get('focus') as RulesFocus) : null,
  }
}

export function serializeTextsParams(state: TextsUrlState): string {
  const out = new URLSearchParams()
  if (state.tab !== 'campaigns' && !state.automatic) out.set('tab', state.tab)
  if (state.filter !== 'all') out.set('filter', state.filter)
  if (state.campaign) out.set('campaign', state.campaign)
  if (state.campaign === 'new' && state.preset) out.set('preset', state.preset)
  if (state.campaign && state.campaign !== 'new' && state.edit) out.set('edit', '1')
  if (state.campaign && state.campaign !== 'new' && state.isReport) out.set('view', 'report')
  if (state.phones) out.set('phones', '1')
  if (state.phones && state.phone) out.set('phone', state.phone)
  if (state.automatic) out.set('automatic', state.automatic)
  if (state.show !== 'all') out.set('show', state.show)
  if (state.from) out.set('from', state.from)
  if (state.focus) out.set('focus', state.focus)
  return out.toString()
}

/** Merge a change; closing a sheet also drops the params that only belong to it. */
export function patchTextsParams(state: TextsUrlState, patch: Partial<TextsUrlState>): TextsUrlState {
  const next = { ...state, ...patch }
  if (!next.campaign) return { ...next, preset: null, edit: false, isReport: false, ...(next.phones ? {} : { phone: null }) }
  if (!next.phones) return { ...next, phone: null }
  return next
}

/**
 * Opening a sheet gets its own history entry, so the browser's Back closes
 * it instead of leaving the page; tabs, filters and closing replace.
 */
export function opensSheet(prev: TextsUrlState, next: TextsUrlState): boolean {
  return (prev.campaign === null && next.campaign !== null)
    || (!prev.phones && next.phones)
    || (prev.automatic === null && next.automatic !== null)
}
