/**
 * The build's design step: choose the store's launch look from the menu it
 * just read, then save it.
 *
 * The owner's own pick in the wizard always wins. Otherwise the AI chooses
 * from the look catalog; if it cannot (no key, timeout, an off-catalog
 * answer) the menu-shape rules choose. Choosing never fails the build: only
 * the menu read or the save can.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { openRouterChat, type ChatMessage } from '@/lib/ai/openrouter'
import { BOOST_AI_FALLBACK_MODEL, BOOST_AI_MODEL } from '@/lib/boost/ai/prompt'
import type { OnboardingAnswers } from './answers'
import {
  RULE_REASONS,
  buildDesignPrompt,
  parseDesignAnswer,
  pickLookByRules,
  summarizeMenuShape,
  type MenuShape,
} from './design-pick'
import { toStoreLook, type LaunchFontPair, type StoreLook } from './store-type'

type AdminClient = SupabaseClient<Database>

export const DESIGN_AI_MODEL = process.env.ONBOARDING_DESIGN_MODEL || BOOST_AI_MODEL
const DESIGN_AI_TIMEOUT_MS = 30_000
const DESIGN_AI_MAX_TOKENS = 300
/** A fresh store's menu is small; this only bounds the read. */
const MAX_MENU_ROWS = 1000
const OWNER_PICK_REASON = 'The layout you picked.'

export type DesignSource = 'owner' | 'ai' | 'rules'

export interface DesignChoice {
  look: StoreLook
  fontPair: LaunchFontPair | null
  reason: string
  source: DesignSource
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
interface ItemRow { name: string; price: number | null; category_id: string | null }

/** The store's menu as the design picker sees it: categories in menu order. */
export async function readMenuShape(admin: AdminClient, tenantId: string): Promise<MenuShape> {
  const [categories, items] = await Promise.all([
    admin.from('categories').select('id, name').eq('tenant_id', tenantId).order('order', { ascending: true }).limit(MAX_MENU_ROWS),
    admin.from('menu_items').select('name, price, category_id').eq('tenant_id', tenantId).limit(MAX_MENU_ROWS),
  ])
  if (categories.error) throw new Error(`Categories could not be read: ${categories.error.message}`)
  if (items.error) throw new Error(`Menu items could not be read: ${items.error.message}`)

  const categoryRows = (categories.data ?? []) as CategoryRow[]
  const order = new Map(categoryRows.map((category, index) => [category.id, index]))
  const names = new Map(categoryRows.map((category) => [category.id, category.name]))
  const rows = ((items.data ?? []) as ItemRow[])
    .map((item) => ({
      categoryName: (item.category_id && names.get(item.category_id)) || 'Menu',
      itemName: item.name,
      price: Number(item.price ?? 0),
      position: (item.category_id ? order.get(item.category_id) : undefined) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.position - b.position)
    .map(({ categoryName, itemName, price }) => ({ categoryName, itemName, price }))
  return summarizeMenuShape(rows)
}

async function askModel(answers: OnboardingAnswers, shape: MenuShape, model: DesignModel): Promise<DesignChoice | null> {
  try {
    const content = await model(buildDesignPrompt({
      storeName: answers.storeName,
      storeType: answers.storeType,
      tagline: answers.tagline || null,
      orderTypes: answers.orderTypes,
      shape,
    }))
    const answer = parseDesignAnswer(content)
    if (!answer) console.warn('[onboarding] design AI answered off-catalog; using the menu rules')
    return answer ? { ...answer, source: 'ai' } : null
  } catch (error) {
    console.warn('[onboarding] design AI unavailable; using the menu rules', error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * The look this store launches with. Reads the menu only when it must choose;
 * a store without a menu is designed for its store type.
 */
export async function chooseLaunchDesign(
  admin: AdminClient,
  tenantId: string,
  answers: OnboardingAnswers,
  model: DesignModel = defaultModel,
): Promise<DesignChoice> {
  const ownerLook = toStoreLook(answers.look)
  if (ownerLook) return { look: ownerLook, fontPair: null, reason: OWNER_PICK_REASON, source: 'owner' }

  const shape = await readMenuShape(admin, tenantId)
  const fromModel = shape.itemCount > 0 ? await askModel(answers, shape, model) : null
  if (fromModel) return fromModel
  const look = pickLookByRules(answers.storeType, shape)
  return { look, fontPair: null, reason: RULE_REASONS[look], source: 'rules' }
}
