/**
 * The build's design step: choose the store's launch look and hero from the
 * menu it just read, then save them.
 *
 * The owner's own look pick in the wizard always wins. Otherwise the AI
 * chooses from the look and hero catalogs; if it cannot (no key, timeout, an
 * off-catalog answer) the menu-shape rules choose. Choosing never fails the
 * build: only the reads or the saves can, and build.ts keeps the starting look
 * when they do.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { openRouterChat, type ChatMessage } from '@/lib/ai/openrouter'
import { BOOST_AI_FALLBACK_MODEL, BOOST_AI_MODEL } from '@/lib/boost/ai/prompt'
import { heroDesignV5Schema } from '@/lib/hero-builder/schema'
import type { OnboardingAnswers } from './answers'
import {
  RULE_REASONS,
  buildDesignPrompt,
  parseDesignAnswer,
  pickHeroByRules,
  pickLookByRules,
  summarizeMenuShape,
  type MenuShape,
} from './design-pick'
import { availableLaunchHeroes, buildLaunchHero, type LaunchHeroChoice, type LaunchHeroInput } from './launch-heroes'
import { buildPaymentMethods } from './plan'
import { STORE_TYPES, toStoreLook, type LaunchFontPair, type StoreLook } from './store-type'

type AdminClient = SupabaseClient<Database>

export const DESIGN_AI_MODEL = process.env.ONBOARDING_DESIGN_MODEL || BOOST_AI_MODEL
const DESIGN_AI_TIMEOUT_MS = 30_000
const DESIGN_AI_MAX_TOKENS = 300
/** A fresh store's menu is small; this only bounds the read. */
const MAX_MENU_ROWS = 1000
const MAX_FAVORITES = 3
const FALLBACK_BUTTON_COLOR = '#111111'
const OWNER_PICK_REASON = 'The layout you picked.'

export type DesignSource = 'owner' | 'ai' | 'rules'

export interface DesignChoice {
  look: StoreLook
  fontPair: LaunchFontPair | null
  hero: LaunchHeroChoice
  reason: string
  source: DesignSource
}

/** What the design step knows about the store, read once. */
export interface StoreFacts {
  shape: MenuShape
  /** Dishes the owner named as best sellers (marked featured by the menu step). */
  favorites: Array<{ name: string; price: number }>
  /** The storefront button color the branding step saved. */
  buttonColor: string
}

export type DesignModel = (messages: ChatMessage[]) => Promise<string>

const defaultModel: DesignModel = async (messages) => {
  const result = await openRouterChat({
    model: DESIGN_AI_MODEL,
    fallbackModel: BOOST_AI_FALLBACK_MODEL,
    messages,
    maxTokens: DESIGN_AI_MAX_TOKENS,
    temperature: 0.3,
    timeoutMs: DESIGN_AI_TIMEOUT_MS,
    title: 'WebNegosyo onboarding design',
  })
  return result.content
}

interface CategoryRow { id: string; name: string }
interface ItemRow { name: string; price: number | null; category_id: string | null; is_featured: boolean | null }

export async function readStoreFacts(admin: AdminClient, tenantId: string): Promise<StoreFacts> {
  const [categories, items, tenant] = await Promise.all([
    admin.from('categories').select('id, name').eq('tenant_id', tenantId).order('order', { ascending: true }).limit(MAX_MENU_ROWS),
    admin.from('menu_items').select('name, price, category_id, is_featured').eq('tenant_id', tenantId).limit(MAX_MENU_ROWS),
    admin.from('tenants').select('button_primary_color').eq('id', tenantId).limit(1),
  ])
  if (categories.error) throw new Error(`Categories could not be read: ${categories.error.message}`)
  if (items.error) throw new Error(`Menu items could not be read: ${items.error.message}`)
  if (tenant.error) throw new Error(`Store colors could not be read: ${tenant.error.message}`)

  const categoryRows = (categories.data ?? []) as CategoryRow[]
  const order = new Map(categoryRows.map((category, index) => [category.id, index]))
  const names = new Map(categoryRows.map((category) => [category.id, category.name]))
  const itemRows = (items.data ?? []) as ItemRow[]
  const rows = itemRows
    .map((item) => ({
      categoryName: (item.category_id && names.get(item.category_id)) || 'Menu',
      itemName: item.name,
      price: Number(item.price ?? 0),
      position: (item.category_id ? order.get(item.category_id) : undefined) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.position - b.position)
    .map(({ categoryName, itemName, price }) => ({ categoryName, itemName, price }))
  const favorites = itemRows
    .filter((item) => item.is_featured && Number(item.price) > 0)
    .slice(0, MAX_FAVORITES)
    .map((item) => ({ name: item.name, price: Number(item.price) }))
  const buttonColor = (tenant.data?.[0] as { button_primary_color?: string | null } | undefined)?.button_primary_color

  return { shape: summarizeMenuShape(rows), favorites, buttonColor: buttonColor || FALLBACK_BUTTON_COLOR }
}

async function askModel(
  answers: OnboardingAnswers,
  facts: StoreFacts,
  heroes: readonly LaunchHeroChoice[],
  model: DesignModel,
): Promise<DesignChoice | null> {
  try {
    const content = await model(buildDesignPrompt({
      storeName: answers.storeName,
      storeType: answers.storeType,
      tagline: answers.tagline || null,
      orderTypes: answers.orderTypes,
      shape: facts.shape,
      heroes,
    }))
    const answer = parseDesignAnswer(content, heroes)
    if (!answer) {
      console.warn('[onboarding] design AI answered off-catalog; using the menu rules')
      return null
    }
    return { ...answer, hero: answer.hero ?? pickHeroByRules(answer.look, heroes), source: 'ai' }
  } catch (error) {
    console.warn('[onboarding] design AI unavailable; using the menu rules', error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * The look and hero this store launches with. A store without a menu is
 * designed for its store type, without asking the AI.
 */
export async function chooseLaunchDesign(
  answers: OnboardingAnswers,
  facts: StoreFacts,
  model: DesignModel = defaultModel,
): Promise<DesignChoice> {
  const heroes = availableLaunchHeroes({ orderTypes: answers.orderTypes, favorites: facts.favorites })
  const ownerLook = toStoreLook(answers.look)
  if (ownerLook) {
    return { look: ownerLook, fontPair: null, hero: pickHeroByRules(ownerLook, heroes), reason: OWNER_PICK_REASON, source: 'owner' }
  }

  const fromModel = facts.shape.itemCount > 0 ? await askModel(answers, facts, heroes, model) : null
  if (fromModel) return fromModel
  const look = pickLookByRules(answers.storeType, facts.shape)
  return { look, fontPair: null, hero: pickHeroByRules(look, heroes), reason: RULE_REASONS[look], source: 'rules' }
}

export function launchHeroInput(answers: OnboardingAnswers, facts: StoreFacts): LaunchHeroInput {
  return {
    storeName: answers.storeName,
    line: answers.tagline?.trim() || STORE_TYPES[answers.storeType].heroLine,
    orderTypes: answers.orderTypes,
    paymentNames: buildPaymentMethods(answers.payments).map((method) => method.name),
    hours: answers.hours,
    favorites: facts.favorites,
    buttonColor: facts.buttonColor,
  }
}

/**
 * Save the hero the way Hero Builder's publish does: a validated v5 design,
 * `hero_preset = 'custom'`, hero on. "none" switches the hero off and keeps
 * the look's text hero for when the owner turns it back on.
 */
export async function applyLaunchHero(admin: AdminClient, tenantId: string, hero: LaunchHeroChoice, input: LaunchHeroInput): Promise<void> {
  let patch: Record<string, unknown> = { hero_section_enabled: false }
  if (hero !== 'none') {
    const parsed = heroDesignV5Schema.safeParse(buildLaunchHero(hero, input))
    if (!parsed.success) throw new Error(`Launch hero "${hero}" failed the design check: ${parsed.error.issues[0]?.message ?? 'invalid'}`)
    patch = { hero_design: JSON.stringify(parsed.data), hero_preset: 'custom', hero_section_enabled: true }
  }
  const { data, error } = await admin.from('tenants').update(patch as never).eq('id', tenantId).select('id')
  if (error) throw new Error(`Hero could not be saved: ${error.message}`)
  if (!data || data.length !== 1) throw new Error('Hero could not be saved: store not found')
}
