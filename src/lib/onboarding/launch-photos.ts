/**
 * Stock photos for a launch hero. A new store has no photos of its own, so a
 * hero template keeps its stock photography, but only pictures that suit the
 * store type: a grill never opens on the template's burger or salad. A menu
 * CATEGORY the stock set has a picture of (Burgers, Pizza, Ramen…) moves that
 * photo first. Dish names are not used: "Lechon Kawali with Salted Egg Salad"
 * is not a salad bar, and pancit is not the ramen in the stock photo.
 *
 * Milk tea and "other" stores get no photos: nothing in the stock set shows
 * what they sell, so they launch on a photo-free hero.
 *
 * Pure: no I/O.
 */

import { PHOTOS, photo } from '@/lib/hero-builder/section-presets'
import type { TemplatePhoto } from '@/lib/hero-builder/template-copy'
import type { StoreType } from './store-type'

type PhotoKey = keyof typeof PHOTOS

/** A dish close-up, or a room (dining room, counter) for backgrounds. */
export type PhotoKind = 'dish' | 'room'

export interface PhotoSlot {
  kind: PhotoKind
  /** Pixel width requested from the image CDN. */
  width: number
}

const ALTS: Record<PhotoKey, string> = {
  feast: 'A table of freshly cooked dishes',
  diningRoom: 'A dining room set for dinner',
  restaurant: 'A warm, busy dining room',
  restaurantWarm: 'A cozy restaurant interior',
  coffeeCup: 'A freshly poured cup of coffee',
  coffeeBar: 'A café counter with coffee',
  bowl: 'A fresh rice bowl',
  pizza: 'A freshly baked pizza',
  burger: 'A stacked burger',
  salad: 'A bright salad bowl',
  riceBowl: 'A colorful rice plate',
  pancakes: 'A stack of pancakes',
  bread: 'Freshly baked bread',
  croissants: 'A tray of freshly baked croissants',
  ramen: 'A steaming bowl of noodle soup',
  plated: 'A plated main course',
}

interface PhotoPool {
  dish: readonly PhotoKey[]
  room: readonly PhotoKey[]
}

const POOLS: Record<StoreType, PhotoPool | null> = {
  restaurant: { dish: ['feast', 'plated', 'riceBowl', 'bowl'], room: ['restaurantWarm', 'diningRoom', 'restaurant'] },
  cafe: { dish: ['coffeeCup', 'croissants', 'pancakes'], room: ['coffeeBar'] },
  bakery: { dish: ['croissants', 'bread', 'coffeeCup'], room: ['coffeeBar'] },
  milk_tea: null,
  other: null,
}

/** Category names that earn their dish photo a place up front. */
const CATEGORY_DISHES: ReadonlyArray<readonly [RegExp, PhotoKey]> = [
  [/burger/i, 'burger'],
  [/pizza/i, 'pizza'],
  [/ramen|udon/i, 'ramen'],
  [/salads?\b/i, 'salad'],
  [/pancake|waffle/i, 'pancakes'],
  [/croissant|pastr/i, 'croissants'],
  [/bread|pandesal|loaf|sourdough/i, 'bread'],
]

export function hasStockPhotos(storeType: StoreType): boolean {
  return POOLS[storeType] !== null
}

/** The store's dish photos, best first: its categories' own, then its type's. */
function dishOrder(pool: PhotoPool, categories: readonly string[]): PhotoKey[] {
  const text = categories.join(' | ')
  const onMenu = CATEGORY_DISHES.filter(([pattern]) => pattern.test(text)).map(([, key]) => key)
  return [...new Set([...onMenu, ...pool.dish])]
}

/**
 * One photo per slot, never the same picture twice while the pool lasts.
 * Empty for a store type without stock photos.
 */
export function pickLaunchPhotos(storeType: StoreType, categories: readonly string[], slots: readonly PhotoSlot[]): TemplatePhoto[] {
  const pool = POOLS[storeType]
  if (!pool) return []
  const queues: Record<PhotoKind, PhotoKey[]> = { dish: dishOrder(pool, categories), room: [...pool.room] }
  const used = new Set<PhotoKey>()
  return slots.map((slot) => {
    const other: PhotoKind = slot.kind === 'dish' ? 'room' : 'dish'
    const key = [...queues[slot.kind], ...queues[other]].find((candidate) => !used.has(candidate)) ?? queues[slot.kind][0]
    used.add(key)
    return { url: photo(PHOTOS[key], slot.width), alt: ALTS[key] }
  })
}
