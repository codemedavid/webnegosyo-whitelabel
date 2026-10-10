/**
 * The build's design step: choose the store's launch look and hero from the
 * menu it just read, write the hero's words, then save them.
 *
 * The owner's own look pick in the wizard always wins; the AI still picks the
 * hero template and writes its words. Otherwise the AI chooses from the look
 * and hero catalogs; if it cannot (no key, timeout, an off-catalog answer) the
 * menu-shape rules choose and the hero gets honest store-type copy. Choosing
 * never fails the build: only the reads or the saves can, and build.ts keeps
 * the starting look when they do.
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
import { cleanLaunchCopy, fallbackLaunchCopy, type LaunchCopy } from './launch-copy'
import { availableLaunchHeroes, buildLaunchHero, launchHeroHeader, type LaunchHero, type LaunchHeroInput } from './launch-heroes'
import { buildPaymentMethods } from './plan'
import { toStoreLook, type LaunchFontPair, type StoreLook } from './store-type'

type AdminClient = SupabaseClient<Database>

export const DESIGN_AI_MODEL = process.env.ONBOARDING_DESIGN_MODEL || BOOST_AI_MODEL
const DESIGN_AI_TIMEOUT_MS = 30_000
const DESIGN_AI_MAX_TOKENS = 700
/** A fresh store's menu is small; this only bounds the read. */
const MAX_MENU_ROWS = 1000
const MAX_FAVORITES = 3
const FALLBACK_BUTTON_COLOR = '#111111'
const OWNER_PICK_REASON = 'The layout you picked.'
/** Below this spread between RGB channels (0..1) a brand color reads as black, white or grey. */
const NEUTRAL_CHROMA = 0.15

export type DesignSource = 'owner' | 'ai' | 'rules'

export interface DesignChoice {
  look: StoreLook
  fontPair: LaunchFontPair | null
  hero: LaunchHero
  /** The hero's words: the AI's where they passed the checks, else store-type copy. */
  copy: LaunchCopy
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

/** True for black, white and grey: such a brand gets its color from the hero. */
export function isNeutralColor(hex: string): boolean {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return false
  const value = parseInt(match[1], 16)
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255]
  return (Math.max(...channels) - Math.min(...channels)) / 255 < NEUTRAL_CHROMA
}

export function launchHeroInput(answers: OnboardingAnswers, facts: StoreFacts): LaunchHeroInput {
  return {
    storeName: answers.storeName,
    storeType: answers.storeType,
    orderTypes: answers.orderTypes,
    paymentNames: buildPaymentMethods(answers.payments).map((method) => method.name),
    hours: answers.hours,
    favorites: facts.favorites,
    menuCategories: facts.shape.categories.map((category) => category.name),
    buttonColor: facts.buttonColor,
  }
}

interface ModelPick {
  look: StoreLook
  hero: LaunchHero | null
  fontPair: LaunchFontPair | null
  reason: string
  copy: unknown
}

async function askModel(
  answers: OnboardingAnswers,
  facts: StoreFacts,
  heroes: readonly LaunchHero[],
  fixedLook: StoreLook | null,
  model: DesignModel,
): Promise<ModelPick | null> {
  try {
    const content = await model(buildDesignPrompt({
      storeName: answers.storeName,
      storeType: answers.storeType,
      tagline: answers.tagline || null,
      orderTypes: answers.orderTypes,
      shape: facts.shape,
      heroes,
      isNeutralBrand: isNeutralColor(facts.buttonColor),
      fixedLook,
    }))
    const answer = parseDesignAnswer(content, heroes)
    if (!answer) {
      console.warn('[onboarding] design AI answered off-catalog; using the menu rules')
      return null
    }
    return answer
  } catch (error) {
    console.warn('[onboarding] design AI unavailable; using the menu rules', error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * The look, hero and hero words this store launches with. A store without a
 * menu is designed for its store type, without asking the AI.
 */
export async function chooseLaunchDesign(
  answers: OnboardingAnswers,
  facts: StoreFacts,
  model: DesignModel = defaultModel,
): Promise<DesignChoice> {
  const input = launchHeroInput(answers, facts)
  const heroes = availableLaunchHeroes(input)
  const ownerLook = toStoreLook(answers.look)
  const fallbackCopy = fallbackLaunchCopy({ storeName: answers.storeName, storeType: answers.storeType, tagline: answers.tagline })
  const fromModel = facts.shape.itemCount > 0 ? await askModel(answers, facts, heroes, ownerLook, model) : null

  const look = ownerLook ?? fromModel?.look ?? pickLookByRules(answers.storeType, facts.shape)
  const { copy, usedAi } = cleanLaunchCopy(fromModel?.copy, fallbackCopy)
  // The press quote needs a line of its own: the store name quoted and signed by itself reads oddly.
  const usable = usedAi ? heroes : heroes.filter((candidate) => candidate !== 'press-quote')
  const modelHero = fromModel?.hero && usable.includes(fromModel.hero) ? fromModel.hero : null
  const hero = modelHero ?? pickHeroByRules({ look, storeType: answers.storeType, available: usable, isNeutralBrand: isNeutralColor(facts.buttonColor) })
  if (ownerLook) return { look, fontPair: null, hero, copy, reason: OWNER_PICK_REASON, source: 'owner' }
  if (fromModel) return { look, fontPair: fromModel.fontPair, hero, copy, reason: fromModel.reason, source: 'ai' }
  return { look, fontPair: null, hero, copy, reason: RULE_REASONS[look], source: 'rules' }
}

/**
 * Save the hero the way Hero Builder's publish does: a validated v5 design,
 * `hero_preset = 'custom'`, hero on. A hero with its own top band also paints
 * the storefront header to match, in the same write.
 */
export async function applyLaunchHero(admin: AdminClient, tenantId: string, hero: LaunchHero, input: LaunchHeroInput, copy: LaunchCopy): Promise<void> {
  const parsed = heroDesignV5Schema.safeParse(buildLaunchHero(hero, input, copy))
  if (!parsed.success) throw new Error(`Launch hero "${hero}" failed the design check: ${parsed.error.issues[0]?.message ?? 'invalid'}`)
  const patch = { hero_design: JSON.stringify(parsed.data), hero_preset: 'custom', hero_section_enabled: true, ...launchHeroHeader(hero) }
  const { data, error } = await admin.from('tenants').update(patch as never).eq('id', tenantId).select('id')
  if (error) throw new Error(`Hero could not be saved: ${error.message}`)
  if (!data || data.length !== 1) throw new Error('Hero could not be saved: store not found')
}
