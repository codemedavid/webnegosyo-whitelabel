import type { Category, MenuItem } from '@/types/database'
import { createTestMenuItem } from '../../fixtures/menu-item.fixture'
import { buildReplyStore, type ReplyStore } from '@/lib/messenger/store-view'
import type { ReplyContext } from '@/lib/messenger/replies'

export const NOW = new Date('2026-11-10T04:00:00Z') // Tuesday, 12:00 in Manila

export function category(id: string, name: string, order: number, extra: Partial<Category> = {}): Category {
  return {
    id, tenant_id: 't1', name, order, is_active: true, display_layout: 'grid',
    created_at: NOW.toISOString(), updated_at: NOW.toISOString(), ...extra,
  }
}

export function dish(id: string, categoryId: string, order: number, extra: Partial<MenuItem> = {}): MenuItem {
  return createTestMenuItem({ id, category_id: categoryId, name: `Dish ${id}`, order, image_url: `https://img.example/${id}.jpg`, ...extra })
}

/** A store with one big category (20 dishes), one small, one empty, one inactive. */
export function sampleStore(overrides: { tenant?: Record<string, unknown>; items?: MenuItem[]; categories?: Category[] } = {}): ReplyStore {
  const categories = overrides.categories ?? [
    category('c-big', 'Rice Meals', 1),
    category('c-small', 'Drinks', 2),
    category('c-empty', 'Desserts', 3),
    category('c-off', 'Old Specials', 4, { is_active: false }),
  ]
  const items = overrides.items ?? [
    ...Array.from({ length: 20 }, (_, index) => dish(`big-${index}`, 'c-big', index)),
    dish('drink-1', 'c-small', 0, { name: 'Iced Tea', price: 45 }),
    dish('drink-sold-out', 'c-small', 1, { is_available: false }),
    dish('special', 'c-off', 0),
  ]
  const store = buildReplyStore({
    tenant: {
      name: 'Karamotan Grill', slug: 'karamotan', logo_url: 'https://img.example/logo.png',
      restaurant_address: 'Purok 3, Mintal, Davao City', timezone: 'Asia/Manila',
      operating_hours: { 2: { closed: false, open: '09:00', close: '21:00' } },
      ...overrides.tenant,
    } as never,
    categories,
    menuItems: items,
    rootDomain: 'webnegosyo.com',
    appUrl: null,
    now: NOW,
  })
  if (!store) throw new Error('sample store did not build')
  return store
}

export function sampleContext(store: ReplyStore = sampleStore(), linkToken: string | null = null): ReplyContext {
  return { store, linkToken }
}
