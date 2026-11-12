/** @jest-environment node */
/**
 * Owl's set-up tools (2026-11-12): payment methods, inventory detail, Lalamove
 * readiness and University lessons. Reads hand the model refs (never ids);
 * proposals are refused — filing nothing — unless the change is valid, and a
 * pasted Lalamove key never survives into storage or the model.
 */
import { createRefBook } from '@/lib/assistant/refs'
import { availableTools, factsForModel } from '@/lib/assistant/tools/registry'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({}) }) }))
const mockCreatePending = jest.fn()
jest.mock('@/lib/assistant/actions/store', () => ({ createPendingAction: (...a: unknown[]) => mockCreatePending(...a) }))
const mockSetup = jest.fn()
const mockHostQr = jest.fn()
jest.mock('@/lib/assistant/data/payment-methods', () => ({
  readPaymentSetup: () => mockSetup(),
  hostPaymentQr: (...a: unknown[]) => mockHostQr(...a),
}))

import { matchOrderTypes, cleanPaymentDetails, type StoreOrderType } from '@/lib/assistant/insights/payment-methods'
import { buildPaymentMethodsResult } from '@/lib/assistant/tools/reads/payment-methods'
import { proposePaymentMethodChangeTool, proposePaymentMethodTool } from '@/lib/assistant/tools/propose/payment-method'
import { rankLessons, type LessonCandidate } from '@/lib/assistant/insights/lessons'
import { buildLessonsResult } from '@/lib/assistant/tools/reads/lessons'
import { evaluateDeliverySetup, redactLalamoveKeys, KEY_REMOVED, type DeliverySetupInput } from '@/lib/assistant/insights/delivery-setup'
import { buildDeliverySetupResult } from '@/lib/assistant/tools/reads/delivery-setup'
import { dishRecipe, ingredientUsage } from '@/lib/assistant/insights/ingredient-detail'
import { pickUnit } from '@/lib/assistant/tools/propose/ingredient'
import { pickIngredient } from '@/lib/assistant/tools/reads/ingredient'
import { ASSISTANT_TOOLS } from '@/lib/assistant/tools'
import type { InventoryItem, Recipe, RecipeComponent } from '@/types/database'

const DINE: StoreOrderType = { id: 'ot-dine', type: 'dine_in', name: 'Dine in', isEnabled: true }
const PICK: StoreOrderType = { id: 'ot-pick', type: 'pickup', name: 'Take-out', isEnabled: true }
const DELIV: StoreOrderType = { id: 'ot-deliv', type: 'delivery', name: 'Delivery', isEnabled: false }
const ORDER_TYPES = [DINE, PICK, DELIV]
const GCASH_ID = '00000000-0000-4000-8000-0000000000a1'

function ctx(photos: string[] = [], refs = createRefBook({})) {
  return {
    tenantId: 't',
    tenantSlug: 's',
    conversationId: 'c',
    caller: { userId: 'u', role: 'admin', is_owner: true, permissions: null },
    flags: { inventoryEnabled: true, customerHubOn: true, menuEngineeringEnabled: true },
    refs,
    photos,
    memo: <T,>(_key: string, load: () => Promise<T>) => load(),
  }
}

function setup(methods: Array<Record<string, unknown>> = []) {
  return { methods, orderTypes: ORDER_TYPES }
}

const gcash = { id: GCASH_ID, name: 'GCash', details: '0917 123 4567 · J. Cruz', qrCodeUrl: null, isActive: true, requireProof: false, orderTypeIds: ['ot-dine'], updatedAt: '2026-11-01T00:00:00Z' }

beforeEach(() => {
  jest.clearAllMocks()
  mockCreatePending.mockResolvedValue({ id: 'act-1', expiresAt: '2026-11-12T01:00:00Z' })
  mockSetup.mockResolvedValue(setup())
  mockHostQr.mockResolvedValue('https://ik.imagekit.io/x/payment-qr-codes/t/owl-qr.jpg')
})

describe('payment methods', () => {
  test('order types: none named = every enabled one (a method with none is hidden at checkout)', () => {
    expect(matchOrderTypes(null, ORDER_TYPES)).toEqual({ ok: true, ids: ['ot-dine', 'ot-pick'] })
    expect(matchOrderTypes(['takeout'], ORDER_TYPES)).toEqual({ ok: true, ids: ['ot-pick'] })
    expect(matchOrderTypes(['Take-out', 'dine in'], ORDER_TYPES)).toEqual({ ok: true, ids: ['ot-pick', 'ot-dine'] })
    expect(matchOrderTypes(['drive thru'], ORDER_TYPES)).toEqual({ ok: false, unknown: ['drive thru'] })
  })

  test('details lose control characters and stay within 500 characters', () => {
    expect(cleanPaymentDetails('0917\u0000 123\n4567')).toBe('0917 123\n4567')
    expect(cleanPaymentDetails('   ')).toBeNull()
    expect(cleanPaymentDetails('x'.repeat(600))).toHaveLength(500)
  })

  test('the read hands out refs, never ids, and says which order types show each method', () => {
    const refs = createRefBook({})
    const facts = factsForModel(buildPaymentMethodsResult(setup([gcash]), refs))
    expect(JSON.stringify(facts)).not.toContain(GCASH_ID)
    expect(facts.methods).toEqual([{ ref: 'y1', name: 'GCash', on: true, orderTypes: 'Dine in', proofRequired: false, hasQr: false, hasDetails: true }])
  })

  test('a new method is filed with the store’s own order types and the hosted QR on the card', async () => {
    const result = await proposePaymentMethodTool.run(ctx(['data:image/jpeg;base64,AAAA']), {
      name: 'Maya', details: '0918 000 0000 · J. Cruz', orderTypes: null, requireProof: true, qrPhoto: 1,
    })
    expect(mockHostQr).toHaveBeenCalledWith('t', 'data:image/jpeg;base64,AAAA')
    expect(mockCreatePending).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'payment_method',
      payload: { name: 'Maya', details: '0918 000 0000 · J. Cruz', qrCodeUrl: 'https://ik.imagekit.io/x/payment-qr-codes/t/owl-qr.jpg', orderTypeIds: ['ot-dine', 'ot-pick'], requireProof: true },
    }))
    expect(result.card).toMatchObject({ type: 'confirm', imageUrl: 'https://ik.imagekit.io/x/payment-qr-codes/t/owl-qr.jpg' })
  })

  test('refused, filing nothing: a duplicate name, an unknown order type, a QR photo that is not attached', async () => {
    mockSetup.mockResolvedValue(setup([gcash]))
    const base = { details: null, orderTypes: null, requireProof: null, qrPhoto: null }
    expect((await proposePaymentMethodTool.run(ctx(), { ...base, name: 'gcash' })).facts.proposed).toBe(false)
    expect((await proposePaymentMethodTool.run(ctx(), { ...base, name: 'Maya', orderTypes: ['drive thru'] })).facts.proposed).toBe(false)
    expect((await proposePaymentMethodTool.run(ctx([]), { ...base, name: 'Maya', qrPhoto: 1 })).facts.proposed).toBe(false)
    expect(mockCreatePending).not.toHaveBeenCalled()
    expect(mockHostQr).not.toHaveBeenCalled()
  })

  test('a change carries only what changes and the row version it was shown', async () => {
    mockSetup.mockResolvedValue(setup([gcash]))
    const refs = createRefBook({})
    const ref = refs.refFor('payment', GCASH_ID)
    await proposePaymentMethodChangeTool.run(ctx([], refs), {
      method: ref, name: null, details: null, active: false, requireProof: false, orderTypes: null, qrPhoto: null, removeQr: null,
    })
    expect(mockCreatePending).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'payment_method_change',
      payload: {
        paymentMethodId: GCASH_ID,
        name: 'GCash',
        changes: { name: null, details: null, qrCodeUrl: null, isActive: false, requireProof: null, orderTypeIds: null },
        expectedUpdatedAt: '2026-11-01T00:00:00Z',
      },
    }))
  })

  test('a change that changes nothing is refused', async () => {
    mockSetup.mockResolvedValue(setup([gcash]))
    const refs = createRefBook({})
    const result = await proposePaymentMethodChangeTool.run(ctx([], refs), {
      method: refs.refFor('payment', GCASH_ID), name: 'GCash', details: null, active: true, requireProof: null, orderTypes: null, qrPhoto: null, removeQr: null,
    })
    expect(result.facts.proposed).toBe(false)
    expect(mockCreatePending).not.toHaveBeenCalled()
  })
})

const LESSONS: LessonCandidate[] = [
  { id: '1', slug: 'welcome-to-smartmenu', courseSlug: 'getting-started', title: 'Welcome to SmartMenu', summary: 'This is an introduction video about this course', moduleTitle: 'Welcome', courseTitle: 'Getting Started with SmartMenu', videoUrl: 'https://youtu.be/abcdefghijk', durationMinutes: 1 },
  { id: '2', slug: 'connecting-sa-printer', courseSlug: 'getting-started', title: 'Connecting Sa Printer', summary: null, moduleTitle: 'Welcome', courseTitle: 'Getting Started with SmartMenu', videoUrl: 'https://youtu.be/bcdefghijkl', durationMinutes: 3 },
  { id: '3', slug: 'payment-methods-management', courseSlug: 'getting-started', title: 'Payment Methods Management', summary: null, moduleTitle: 'Welcome', courseTitle: 'Getting Started with SmartMenu', videoUrl: 'https://youtu.be/cdefghijklm', durationMinutes: 3 },
  { id: '4', slug: 'inventory-management', courseSlug: 'getting-started', title: 'Inventory Management', summary: null, moduleTitle: 'Managing SmartMenu On PC', courseTitle: 'Getting Started with SmartMenu', videoUrl: 'https://youtu.be/defghijklmn', durationMinutes: null },
  { id: '5', slug: 'senior-pwd-sales-book', courseSlug: 'senior-pwd-discounts', title: 'Ang Senior & PWD sales book', summary: 'Totals, lahat ng discount', moduleTitle: 'Ang sales book mo', courseTitle: 'Senior Citizen & PWD Discounts', videoUrl: null, durationMinutes: 4 },
]

describe('University lessons', () => {
  test('owners’ own words find the lesson', () => {
    expect(rankLessons('paano maglagay ng gcash sa checkout?', LESSONS)[0]?.slug).toBe('payment-methods-management')
    expect(rankLessons('How do I connect my printer?', LESSONS)[0]?.slug).toBe('connecting-sa-printer')
    expect(rankLessons('how do I count my stock', LESSONS)[0]?.slug).toBe('inventory-management')
    expect(rankLessons('senior discount book', LESSONS)[0]?.slug).toBe('senior-pwd-sales-book')
  })

  test('nothing really matching = no lesson, never a random one', () => {
    expect(rankLessons('what is the weather tomorrow', LESSONS)).toEqual([])
    expect(rankLessons('how do I', LESSONS)).toEqual([])
  })

  test('the card links inside the admin and only ever carries a resolvable video', () => {
    const result = buildLessonsResult('printer', LESSONS)
    expect(result.card).toMatchObject({
      type: 'lessons',
      lessons: [{ title: 'Connecting Sa Printer', path: '/learn/getting-started/connecting-sa-printer', watchUrl: 'https://www.youtube.com/watch?v=bcdefghijkl' }],
    })
    const none = buildLessonsResult('weather', LESSONS)
    expect(none.card).toBeUndefined()
    expect(none.facts.lessonsAvailable).toContain('Inventory Management')
  })
})

const READY: DeliverySetupInput = {
  lalamoveEnabled: true, market: 'PH', isSandbox: false, hasKeys: true, senderPhone: '0917 123 4567', footerPhone: null,
  storePinned: true, branches: { total: 0, pinned: 0 }, deliveryOrderTypeOn: true, recentStatuses: ['COMPLETED', 'CANCELED', 'ON_GOING'],
}

describe('Lalamove readiness', () => {
  test('a store with everything in place is ready; bookings are counted by outcome', () => {
    const setup = evaluateDeliverySetup(READY)
    expect(setup.ready).toBe(true)
    expect(setup.environment).toBe('live')
    expect(setup.bookings).toEqual({ total: 3, done: 1, active: 1, cancelled: 1 })
  })

  test('not switched on: the owner is told who to ask and every other step waits', () => {
    const setup = evaluateDeliverySetup({ ...READY, lalamoveEnabled: false, hasKeys: false })
    expect(setup.ready).toBe(false)
    expect(setup.steps[0]).toMatchObject({ id: 'switched_on', state: 'todo' })
    expect(setup.steps[0].next).toMatch(/WebNegosyo team/)
    expect(setup.steps.find((step) => step.id === 'keys')?.state).toBe('blocked')
  })

  test('each missing piece is its own next step', () => {
    const setup = evaluateDeliverySetup({ ...READY, hasKeys: false, senderPhone: null, footerPhone: null, storePinned: true, branches: { total: 2, pinned: 1 }, deliveryOrderTypeOn: false })
    expect(setup.steps.filter((step) => step.state === 'todo').map((step) => step.id)).toEqual(['keys', 'rider_phone', 'pickup_pin', 'delivery_on'])
    expect(setup.steps.find((step) => step.id === 'keys')?.next).toMatch(/never in this chat/)
  })

  test('the result says whether keys exist — never what they are', () => {
    const facts = factsForModel(buildDeliverySetupResult(evaluateDeliverySetup(READY), false))
    expect(JSON.stringify(facts)).not.toMatch(/pk_|sk_/)
    expect(facts.rule).toMatch(/Never ask for or accept Lalamove keys/)
  })

  test('a pasted key is cut before the message is stored or sent', () => {
    const { text, removed } = redactLalamoveKeys('here: pk_prod_1a2b3c4d5e6f and sk_test_ZZZZ999999 thanks')
    expect(removed).toBe(2)
    expect(text).toBe(`here: ${KEY_REMOVED} and ${KEY_REMOVED} thanks`)
    expect(redactLalamoveKeys('my pk is fine').removed).toBe(0)
  })
})

describe('inventory detail', () => {
  const units = [{ id: 'g', name: 'gram', abbreviation: 'g', dimension: 'weight' as const, to_base_factor: 1 }]
  const recipes = [
    { id: 'r1', target_type: 'menu_item', menu_item_id: 'sisig' },
    { id: 'r2', target_type: 'menu_item', menu_item_id: 'silog' },
    { id: 'r3', target_type: 'addon', menu_item_id: null },
  ] as unknown as Recipe[]
  const components = [
    { id: 'c1', recipe_id: 'r1', inventory_item_id: 'pork', quantity: 150, unit_id: 'g' },
    { id: 'c2', recipe_id: 'r2', inventory_item_id: 'pork', quantity: 50, unit_id: 'g' },
    { id: 'c3', recipe_id: 'r3', inventory_item_id: 'pork', quantity: 20, unit_id: 'g' },
  ] as unknown as RecipeComponent[]
  const graph = {
    recipes,
    components,
    shelf: [{ id: 'pork', current_qty: 1000, is_active: true, stockUnit: units[0] }],
    units,
    namesByMenuItemId: new Map([['sisig', 'Sisig'], ['silog', 'Porksilog']]),
  }

  test('which dishes use an ingredient, fewest left first, from the same ceiling arithmetic as checkout', () => {
    expect(ingredientUsage('pork', graph)).toEqual({
      dishes: [
        { menuItemId: 'sisig', dish: 'Sisig', perDish: '150 g', canMake: 6 },
        { menuItemId: 'silog', dish: 'Porksilog', perDish: '50 g', canMake: 20 },
      ],
      otherRecipes: 1,
    })
  })

  test('a dish recipe lists each ingredient with what is on the shelf', () => {
    expect(dishRecipe('sisig', graph, new Map([['pork', { name: 'Pork belly', onHand: '1000 g' }]]))).toEqual({
      lines: [{ ingredientId: 'pork', ingredient: 'Pork belly', perDish: '150 g', onHand: '1000 g' }],
      canMake: 6,
    })
    expect(dishRecipe('lumpia', graph, new Map())).toBeNull()
  })

  test('ingredients and units are matched by name the way owners type them', () => {
    const items = [{ id: 'a', name: 'Pork belly' }, { id: 'b', name: 'Pork shoulder' }, { id: 'c', name: 'Rice' }] as InventoryItem[]
    expect(pickIngredient(items, 'rice', null)).toMatchObject({ id: 'c' })
    expect(pickIngredient(items, 'pork', null)).toBe('ambiguous')
    expect(pickIngredient(items, 'beef', null)).toBeNull()
    const storeUnits = [{ id: 'kg', name: 'kilogram', abbreviation: 'kg', is_active: true }, { id: 'pc', name: 'piece', abbreviation: 'pcs', is_active: true }]
    expect(pickUnit(storeUnits, 'KG')?.id).toBe('kg')
    expect(pickUnit(storeUnits, 'pieces')?.id).toBe('pc')
    expect(pickUnit(storeUnits, 'sacks')).toBeNull()
  })
})

describe('who is offered the new tools', () => {
  const names = (permissions: string[] | null, isOwner = false) =>
    availableTools(ASSISTANT_TOOLS, { role: 'admin', is_owner: isOwner, permissions }, { inventoryEnabled: true, customerHubOn: true, menuEngineeringEnabled: true }).map((tool) => tool.name)

  test('Lalamove set-up is the owner’s; payment methods need store set-up; lessons are for everyone with Owl', () => {
    expect(names(null, true)).toEqual(expect.arrayContaining(['get_delivery_setup', 'get_payment_methods', 'find_lessons', 'get_ingredient', 'propose_ingredient']))
    const cashier = names(['assistant', 'pos'])
    expect(cashier).toContain('find_lessons')
    expect(cashier).not.toEqual(expect.arrayContaining(['get_delivery_setup']))
    expect(cashier).not.toContain('get_payment_methods')
    expect(cashier).not.toContain('get_ingredient')
    expect(names(['assistant', 'inventory'])).toContain('get_ingredient')
    expect(names(['assistant', 'inventory'])).not.toContain('propose_ingredient')
  })
})
