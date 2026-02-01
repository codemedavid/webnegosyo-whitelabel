export const MENU_ITEMS_FIXTURE = {
  menuItem1: {
    id: 'menu-item-1',
    name: 'Classic Burger',
    description: 'Juicy beef patty with fresh vegetables',
    base_price: 150,
    image_url: 'https://example.com/burger.jpg',
    available: true,
    category_id: 'category-1',
    tenant_id: 'tenant-1',
  },
  menuItem2: {
    id: 'menu-item-2',
    name: 'Cheese Pizza',
    description: 'Mozzarella cheese on tomato sauce',
    base_price: 250,
    image_url: 'https://example.com/pizza.jpg',
    available: true,
    category_id: 'category-1',
    tenant_id: 'tenant-1',
  },
}

export const VARIATIONS_FIXTURE = {
  singleVariation: {
    id: 'variation-1',
    name: 'Large',
    price_modifier: 50,
  },
  groupedVariations: {
    'size-type': {
      id: 'variation-option-1',
      name: 'Large',
      price_modifier: 50,
    },
    'crust-type': {
      id: 'variation-option-2',
      name: 'Thin',
      price_modifier: 0,
    },
  },
}

export const ADDONS_FIXTURE = {
  addon1: {
    id: 'addon-1',
    name: 'Extra Cheese',
    price: 30,
  },
  addon2: {
    id: 'addon-2',
    name: 'Bacon',
    price: 50,
  },
}

export const TENANT_FIXTURE = {
  tenant1: {
    id: 'tenant-1',
    name: 'Test Restaurant',
    slug: 'test-restaurant',
    domain: 'test.example.com',
    primary_color: '#ff0000',
    secondary_color: '#00ff00',
    background_color: '#ffffff',
    header_color: '#ffffff',
    header_font_color: '#000000',
    cards_color: '#ffffff',
    cards_border_color: '#e5e7eb',
    card_title_color: '#111111',
    card_price_color: '#ff0000',
    card_description_color: '#6b7280',
    text_primary_color: '#111111',
    text_secondary_color: '#6b7280',
    text_muted_color: '#9ca3af',
    border_color: '#e5e7eb',
    success_color: '#10b981',
    warning_color: '#f59e0b',
    error_color: '#ef4444',
    link_color: '#3b82f6',
    shadow_color: 'rgba(0, 0, 0, 0.1)',
    accent_color: '#ffd700',
  },
  tenant2: {
    id: 'tenant-2',
    name: 'Another Restaurant',
    slug: 'another-restaurant',
    domain: 'another.example.com',
    primary_color: '#0000ff',
    secondary_color: '#ffff00',
  },
}

export const CART_ITEMS_FIXTURE = {
  simpleItem: {
    menuItemId: 'menu-item-1',
    menu_item: MENU_ITEMS_FIXTURE.menuItem1,
    quantity: 2,
    selected_variations: undefined,
    selected_variation: undefined,
    selected_addons: [],
    special_instructions: '',
    subtotal: 300,
  },
  itemWithVariation: {
    menuItemId: 'menu-item-1',
    menu_item: MENU_ITEMS_FIXTURE.menuItem1,
    quantity: 1,
    selected_variations: undefined,
    selected_variation: VARIATIONS_FIXTURE.singleVariation,
    selected_addons: [],
    special_instructions: '',
    subtotal: 200,
  },
  itemWithGroupedVariations: {
    menuItemId: 'menu-item-1',
    menu_item: MENU_ITEMS_FIXTURE.menuItem1,
    quantity: 1,
    selected_variations: VARIATIONS_FIXTURE.groupedVariations,
    selected_variation: undefined,
    selected_addons: [],
    special_instructions: '',
    subtotal: 200,
  },
  itemWithAddons: {
    menuItemId: 'menu-item-1',
    menu_item: MENU_ITEMS_FIXTURE.menuItem1,
    quantity: 1,
    selected_variations: undefined,
    selected_variation: undefined,
    selected_addons: [ADDONS_FIXTURE.addon1, ADDONS_FIXTURE.addon2],
    special_instructions: '',
    subtotal: 230,
  },
  complexItem: {
    menuItemId: 'menu-item-1',
    menu_item: MENU_ITEMS_FIXTURE.menuItem1,
    quantity: 2,
    selected_variations: VARIATIONS_FIXTURE.groupedVariations,
    selected_variation: undefined,
    selected_addons: [ADDONS_FIXTURE.addon1, ADDONS_FIXTURE.addon2],
    special_instructions: 'No onions please',
    subtotal: 460,
  },
}

export const ORDER_TYPES_FIXTURE = {
  dineIn: {
    id: 'order-type-1',
    tenant_id: 'tenant-1',
    name: 'Dine In',
    type: 'dine_in',
    description: 'Eat at the restaurant',
  },
  pickup: {
    id: 'order-type-2',
    tenant_id: 'tenant-1',
    name: 'Pickup',
    type: 'pickup',
    description: 'Pick up your order',
  },
  delivery: {
    id: 'order-type-3',
    tenant_id: 'tenant-1',
    name: 'Delivery',
    type: 'delivery',
    description: 'Get it delivered to your doorstep',
  },
}
