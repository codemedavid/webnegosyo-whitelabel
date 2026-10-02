/**
 * Contract-shaped sample payloads for the customer app. The app's prototype
 * fixtures are copied from here, so a schema change that breaks these breaks
 * the prototype in the same commit.
 */

export const VALID_CONFIG = {
  tenant: {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'kape-demo',
    name: 'Kape Demo',
    currency: 'PHP' as const,
  },
  theme: {
    colors: {
      primary: '#00704A',
      onPrimary: '#FFFFFF',
      primarySoft: '#D4E9E2',
      onPrimarySoft: '#1E3932',
      accent: '#CBA258',
      onAccent: '#1E1E1E',
      background: '#F9F7F4',
      surface: '#FFFFFF',
      surfaceMuted: '#F2F0EB',
      text: '#1E1E1E',
      textMuted: '#6B6B6B',
      border: '#E6E3DC',
      success: '#1F8A4C',
      warning: '#B7791F',
      danger: '#C0392B',
    },
    fontKey: 'jakarta' as const,
    corners: 'round' as const,
    logoUrl: 'https://cdn.example.com/kape/logo.png',
  },
  features: {
    ordering: true,
    loyalty: true,
    onlinePayments: true,
    multiBranch: true,
    orderModes: { pickup: true, delivery: true, dineIn: true },
  },
  copy: {
    greeting: 'Good to see you',
    guestJoinTitle: 'Join and earn free coffee',
    guestJoinBody: 'Collect a stamp on every order. Your 10th drink is on us.',
  },
  home: {
    blocks: [
      { id: 'member', type: 'memberCard' as const, visibleWhen: 'always' as const },
      {
        id: 'hero',
        type: 'bannerCarousel' as const,
        visibleWhen: 'always' as const,
        format: 'landscape' as const,
        autoplay: true,
        banners: [
          {
            id: 'b1',
            imageUrl: 'https://cdn.example.com/kape/banner-latte.jpg',
            title: 'Sea Salt Caramel is back',
            subtitle: 'For a limited time only',
            action: { type: 'item' as const, itemId: 'item-sea-salt' },
          },
          {
            id: 'b2',
            imageUrl: 'https://cdn.example.com/kape/banner-rewards.jpg',
            title: 'Double stamps every Monday',
            action: { type: 'rewards' as const },
          },
        ],
      },
      {
        id: 'actions',
        type: 'quickActions' as const,
        visibleWhen: 'always' as const,
        actions: ['pickup', 'delivery', 'dineIn'] as const,
      },
      { id: 'again', type: 'orderAgain' as const, visibleWhen: 'member' as const, title: 'Order again' },
      {
        id: 'featured',
        type: 'featuredItems' as const,
        visibleWhen: 'always' as const,
        title: 'Handcrafted for you',
        source: 'featured' as const,
        itemIds: [],
      },
      {
        id: 'rewards',
        type: 'rewardsTeaser' as const,
        visibleWhen: 'guest' as const,
        title: 'Every cup counts',
        body: 'Sign in with your number to start collecting stamps.',
      },
    ],
  },
}

const group = (
  id: string,
  name: string,
  minSelect: number,
  maxSelect: number | null,
  options: Array<[string, string, number, boolean?]>,
  selectionMode: 'choice' | 'quantity' = 'choice',
) => ({
  id,
  name,
  selectionMode,
  minSelect,
  maxSelect,
  options: options.map(([optionId, optionName, priceDelta, isDefault]) => ({
    id: optionId,
    name: optionName,
    priceDelta,
    isDefault: isDefault ?? false,
    isAvailable: true,
    imageUrl: null,
  })),
})

const SIZE = group('size', 'Size', 1, 1, [
  ['tall', 'Tall 12oz', 0, true],
  ['grande', 'Grande 16oz', 20],
  ['venti', 'Venti 20oz', 35],
])
const MILK = group('milk', 'Milk', 1, 1, [
  ['whole', 'Whole milk', 0, true],
  ['oat', 'Oat milk', 30],
  ['almond', 'Almond milk', 30],
])
const EXTRAS = group(
  'extras',
  'Add-ons',
  0,
  null,
  [
    ['shot', 'Extra espresso shot', 35],
    ['syrup', 'Vanilla syrup', 25],
    ['cream', 'Whipped cream', 20],
  ],
  'quantity',
)

const item = (
  id: string,
  categoryId: string,
  name: string,
  price: number,
  description: string,
  extra: Partial<{ isFeatured: boolean; badge: string | null; compareAtPrice: number | null; modifierGroups: unknown[]; isAvailable: boolean }> = {},
) => ({
  id,
  categoryId,
  name,
  description,
  price,
  compareAtPrice: null,
  imageUrl: `https://cdn.example.com/kape/${id}.jpg`,
  badge: null,
  isAvailable: true,
  isFeatured: false,
  modifierGroups: [],
  ...extra,
})

export const VALID_CATALOG = {
  version: 'cat-2026-09-30T12:00:00Z',
  categories: [
    { id: 'cat-espresso', name: 'Espresso', description: 'Pulled fresh, every time', imageUrl: null },
    { id: 'cat-cold', name: 'Cold Brew', description: null, imageUrl: null },
    { id: 'cat-pastry', name: 'Pastries', description: 'Baked this morning', imageUrl: null },
  ],
  items: [
    item('item-latte', 'cat-espresso', 'Caffè Latte', 145, 'Rich espresso with steamed milk and a light layer of foam.', {
      isFeatured: true,
      modifierGroups: [SIZE, MILK, EXTRAS],
    }),
    item('item-sea-salt', 'cat-espresso', 'Sea Salt Caramel Latte', 175, 'Caramel, a pinch of sea salt, and our signature espresso.', {
      isFeatured: true,
      badge: 'New',
      modifierGroups: [SIZE, MILK, EXTRAS],
    }),
    item('item-americano', 'cat-espresso', 'Americano', 120, 'Espresso shots topped with hot water.', {
      modifierGroups: [SIZE, EXTRAS],
    }),
    item('item-cold-brew', 'cat-cold', 'Classic Cold Brew', 160, 'Steeped for 20 hours for a smooth, chocolatey cup.', {
      isFeatured: true,
      modifierGroups: [SIZE],
    }),
    item('item-nitro', 'cat-cold', 'Nitro Cold Brew', 185, 'Velvety and naturally sweet.', {
      isAvailable: false,
    }),
    item('item-croissant', 'cat-pastry', 'Butter Croissant', 95, 'Flaky, golden, all butter.', {
      compareAtPrice: 110,
    }),
    item('item-ensaymada', 'cat-pastry', 'Ube Ensaymada', 85, 'Soft brioche with ube and queso.', {
      badge: 'Best seller',
    }),
  ],
  orderTypes: [
    { id: 'ot-pickup', kind: 'pickup' as const, name: 'Pick Up', minimumOrder: 0 },
    { id: 'ot-delivery', kind: 'delivery' as const, name: 'Delivery', minimumOrder: 300 },
    { id: 'ot-dine', kind: 'dine_in' as const, name: 'Dine In', minimumOrder: 0 },
  ],
  outlets: [
    {
      id: 'outlet-bgc',
      name: 'BGC High Street',
      address: '9th Ave cor. 28th St, Taguig',
      imageUrl: null,
      latitude: 14.5509,
      longitude: 121.0503,
      supportsPickup: true,
      supportsDelivery: true,
      supportsDineIn: true,
    },
    {
      id: 'outlet-makati',
      name: 'Salcedo Village',
      address: 'Tordesillas St, Makati',
      imageUrl: null,
      latitude: 14.5605,
      longitude: 121.0233,
      supportsPickup: true,
      supportsDelivery: false,
      supportsDineIn: true,
    },
  ],
  pairings: [{ sourceItemId: 'item-latte', targetItemIds: ['item-croissant', 'item-ensaymada'] }],
}

export const VALID_LOYALTY = {
  memberCode: 'WNLC1.aBcDeFgHiJkLmNoPqRsTuVwX',
  programs: [
    {
      id: 'prog-1',
      name: 'Kape Stamps',
      earnMode: 'stamp' as const,
      threshold: 10,
      balance: 7,
      rewardLabel: 'Free drink of your choice',
      minSpend: 100,
      branchName: null,
    },
  ],
  rewards: [
    {
      id: 'ent-1',
      programName: 'Kape Stamps',
      label: 'Free drink of your choice',
      expiresAt: '2026-10-30T15:59:59Z',
      branchName: null,
    },
  ],
  activity: [
    { id: 'act-1', kind: 'earn' as const, delta: 1, label: 'Order #07', occurredAt: '2026-09-29T02:10:00Z' },
    { id: 'act-2', kind: 'reward_issued' as const, delta: -10, label: 'Free drink unlocked', occurredAt: '2026-09-20T05:00:00Z' },
  ],
}

export const VALID_ORDER_DETAIL = {
  id: 'order-1',
  number: '07',
  status: 'preparing' as const,
  placedAt: '2026-09-30T02:10:00Z',
  orderKind: 'pickup' as const,
  orderTypeName: 'Pick Up',
  outletName: 'BGC High Street',
  lines: [
    { id: 'l1', name: 'Caffè Latte', quantity: 2, options: ['Grande 16oz', 'Oat milk'], lineTotal: 390 },
    { id: 'l2', name: 'Butter Croissant', quantity: 1, options: [], lineTotal: 95 },
  ],
  totals: { subtotal: 485, discount: 0, serviceCharge: 0, deliveryFee: 0, total: 485 },
  paymentStatus: 'paid' as const,
  paymentMethodName: 'GCash',
  estimatedReadyAt: '2026-09-30T02:25:00Z',
}
