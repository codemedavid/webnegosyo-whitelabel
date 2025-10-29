import type { Tenant, Category, MenuItem, User } from '@/types/database'

// Mock Tenants
export const mockTenants: Tenant[] = [
  {
    id: 'tenant-1',
    name: 'Bella Italia',
    slug: 'retiro',
    domain: 'bellaitalia.example.com',
    logo_url: '/logos/bella-italia.png',
    primary_color: '#c41e3a',
    secondary_color: '#009246',
    accent_color: '#ffd700',
    messenger_page_id: '123456789',
    messenger_username: 'bellaitalia',
    is_active: true,
    mapbox_enabled: true,
    enable_order_management: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'tenant-2',
    name: 'Sushi Paradise',
    slug: 'sushi-paradise',
    logo_url: '/logos/sushi-paradise.png',
    primary_color: '#d32f2f',
    secondary_color: '#1976d2',
    accent_color: '#ffc107',
    messenger_page_id: '987654321',
    messenger_username: 'sushiparadise',
    is_active: true,
    mapbox_enabled: true,
    enable_order_management: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'tenant-3',
    name: 'Burger Haven',
    slug: 'burger-haven',
    logo_url: '/logos/burger-haven.png',
    primary_color: '#ff6b35',
    secondary_color: '#004e89',
    accent_color: '#f7b801',
    messenger_page_id: '555666777',
    messenger_username: 'burgerhaven',
    is_active: true,
    mapbox_enabled: true,
    enable_order_management: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

// Mock Categories for Bella Italia
export const mockCategories: Category[] = [
  {
    id: 'cat-1',
    tenant_id: 'tenant-1',
    name: 'Appetizers',
    description: 'Start your meal with our delicious starters',
    icon: '🥗',
    order: 1,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'cat-2',
    tenant_id: 'tenant-1',
    name: 'Pizza',
    description: 'Authentic Italian pizzas',
    icon: '🍕',
    order: 2,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'cat-3',
    tenant_id: 'tenant-1',
    name: 'Pasta',
    description: 'Homemade pasta dishes',
    icon: '🍝',
    order: 3,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'cat-4',
    tenant_id: 'tenant-1',
    name: 'Desserts',
    description: 'Sweet treats to finish your meal',
    icon: '🍰',
    order: 4,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'cat-5',
    tenant_id: 'tenant-1',
    name: 'Beverages',
    description: 'Refreshing drinks',
    icon: '🥤',
    order: 5,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

// Mock Menu Items
export const mockMenuItems: MenuItem[] = [
  // Appetizers
  {
    id: 'item-1',
    tenant_id: 'tenant-1',
    category_id: 'cat-1',
    name: 'Bruschetta',
    description: 'Toasted bread topped with fresh tomatoes, basil, garlic, and olive oil',
    price: 8.99,
    image_url: 'https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?w=800',
    variations: [],
    addons: [
      { id: 'addon-1', name: 'Extra Cheese', price: 1.50 },
      { id: 'addon-2', name: 'Extra Garlic', price: 0.50 },
    ],
    is_available: true,
    is_featured: true,
    order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'item-2',
    tenant_id: 'tenant-1',
    category_id: 'cat-1',
    name: 'Caprese Salad',
    description: 'Fresh mozzarella, tomatoes, and basil with balsamic glaze',
    price: 10.99,
    image_url: 'https://images.unsplash.com/photo-1592417817098-8fd3d9eb14a5?w=800',
    variations: [
      { id: 'var-1', name: 'Small', price_modifier: 0, is_default: true },
      { id: 'var-2', name: 'Large', price_modifier: 4.00 },
    ],
    addons: [
      { id: 'addon-3', name: 'Add Prosciutto', price: 3.00 },
    ],
    is_available: true,
    order: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'item-3',
    tenant_id: 'tenant-1',
    category_id: 'cat-1',
    name: 'Garlic Bread',
    description: 'Crispy bread with garlic butter and herbs',
    price: 5.99,
    image_url: 'https://images.unsplash.com/photo-1619096252214-ef06c45683e3?w=800',
    variations: [],
    addons: [
      { id: 'addon-4', name: 'With Cheese', price: 2.00 },
    ],
    is_available: true,
    order: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },

  // Pizza
  {
    id: 'item-4',
    tenant_id: 'tenant-1',
    category_id: 'cat-2',
    name: 'Margherita Pizza',
    description: 'Classic pizza with tomato sauce, mozzarella, and fresh basil',
    price: 14.99,
    image_url: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800',
    variations: [
      { id: 'var-3', name: 'Small (10")', price_modifier: 0, is_default: true },
      { id: 'var-4', name: 'Medium (12")', price_modifier: 4.00 },
      { id: 'var-5', name: 'Large (14")', price_modifier: 7.00 },
      { id: 'var-6', name: 'Extra Large (16")', price_modifier: 10.00 },
    ],
    addons: [
      { id: 'addon-5', name: 'Extra Cheese', price: 2.50 },
      { id: 'addon-6', name: 'Fresh Basil', price: 1.00 },
      { id: 'addon-7', name: 'Olives', price: 1.50 },
      { id: 'addon-8', name: 'Mushrooms', price: 2.00 },
    ],
    is_available: true,
    is_featured: true,
    order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'item-5',
    tenant_id: 'tenant-1',
    category_id: 'cat-2',
    name: 'Pepperoni Pizza',
    description: 'Loaded with pepperoni, mozzarella cheese, and tomato sauce',
    price: 16.99,
    image_url: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=800',
    variations: [
      { id: 'var-7', name: 'Small (10")', price_modifier: 0, is_default: true },
      { id: 'var-8', name: 'Medium (12")', price_modifier: 4.00 },
      { id: 'var-9', name: 'Large (14")', price_modifier: 7.00 },
      { id: 'var-10', name: 'Extra Large (16")', price_modifier: 10.00 },
    ],
    addons: [
      { id: 'addon-9', name: 'Extra Pepperoni', price: 3.00 },
      { id: 'addon-10', name: 'Extra Cheese', price: 2.50 },
      { id: 'addon-11', name: 'Jalapeños', price: 1.00 },
    ],
    is_available: true,
    is_featured: true,
    order: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'item-6',
    tenant_id: 'tenant-1',
    category_id: 'cat-2',
    name: 'Quattro Formaggi',
    description: 'Four cheese pizza with mozzarella, gorgonzola, parmesan, and ricotta',
    price: 18.99,
    image_url: 'https://images.unsplash.com/photo-1571407970349-bc81e7e96c47?w=800',
    variations: [
      { id: 'var-11', name: 'Small (10")', price_modifier: 0, is_default: true },
      { id: 'var-12', name: 'Medium (12")', price_modifier: 4.00 },
      { id: 'var-13', name: 'Large (14")', price_modifier: 7.00 },
    ],
    addons: [
      { id: 'addon-12', name: 'Honey Drizzle', price: 1.50 },
      { id: 'addon-13', name: 'Truffle Oil', price: 3.00 },
    ],
    is_available: true,
    order: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },

  // Pasta
  {
    id: 'item-7',
    tenant_id: 'tenant-1',
    category_id: 'cat-3',
    name: 'Spaghetti Carbonara',
    description: 'Creamy pasta with bacon, eggs, parmesan cheese, and black pepper',
    price: 15.99,
    image_url: 'https://images.unsplash.com/photo-1612874742237-6526221588e3?w=800',
    variations: [],
    addons: [
      { id: 'addon-14', name: 'Extra Bacon', price: 3.00 },
      { id: 'addon-15', name: 'Extra Parmesan', price: 2.00 },
      { id: 'addon-16', name: 'Garlic Bread', price: 3.99 },
    ],
    is_available: true,
    is_featured: true,
    order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'item-8',
    tenant_id: 'tenant-1',
    category_id: 'cat-3',
    name: 'Fettuccine Alfredo',
    description: 'Rich and creamy fettuccine pasta with parmesan cheese sauce',
    price: 14.99,
    image_url: 'https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=800',
    variations: [],
    addons: [
      { id: 'addon-17', name: 'Add Chicken', price: 4.00 },
      { id: 'addon-18', name: 'Add Shrimp', price: 5.00 },
      { id: 'addon-19', name: 'Extra Sauce', price: 1.50 },
    ],
    is_available: true,
    order: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'item-9',
    tenant_id: 'tenant-1',
    category_id: 'cat-3',
    name: 'Penne Arrabbiata',
    description: 'Spicy tomato sauce with garlic, red chili peppers, and olive oil',
    price: 13.99,
    image_url: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=800',
    variations: [],
    addons: [
      { id: 'addon-20', name: 'Extra Spicy', price: 0 },
      { id: 'addon-21', name: 'Add Mozzarella', price: 2.50 },
    ],
    is_available: true,
    order: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'item-10',
    tenant_id: 'tenant-1',
    category_id: 'cat-3',
    name: 'Lasagna Bolognese',
    description: 'Layered pasta with meat sauce, béchamel, and cheese',
    price: 17.99,
    discounted_price: 14.99,
    image_url: 'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=800',
    variations: [],
    addons: [
      { id: 'addon-22', name: 'Side Salad', price: 4.99 },
      { id: 'addon-23', name: 'Garlic Bread', price: 3.99 },
    ],
    is_available: true,
    is_featured: true,
    order: 4,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },

  // Desserts
  {
    id: 'item-11',
    tenant_id: 'tenant-1',
    category_id: 'cat-4',
    name: 'Tiramisu',
    description: 'Classic Italian dessert with coffee-soaked ladyfingers and mascarpone cream',
    price: 7.99,
    image_url: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=800',
    variations: [],
    addons: [],
    is_available: true,
    is_featured: true,
    order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'item-12',
    tenant_id: 'tenant-1',
    category_id: 'cat-4',
    name: 'Panna Cotta',
    description: 'Silky Italian custard with berry compote',
    price: 6.99,
    image_url: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=800',
    variations: [
      { id: 'var-14', name: 'Berry', price_modifier: 0, is_default: true },
      { id: 'var-15', name: 'Caramel', price_modifier: 0 },
      { id: 'var-16', name: 'Chocolate', price_modifier: 0.50 },
    ],
    addons: [],
    is_available: true,
    order: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'item-13',
    tenant_id: 'tenant-1',
    category_id: 'cat-4',
    name: 'Gelato',
    description: 'Authentic Italian ice cream',
    price: 5.99,
    image_url: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=800',
    variations: [
      { id: 'var-17', name: 'Single Scoop', price_modifier: 0, is_default: true },
      { id: 'var-18', name: 'Double Scoop', price_modifier: 3.00 },
      { id: 'var-19', name: 'Triple Scoop', price_modifier: 5.00 },
    ],
    addons: [
      { id: 'addon-24', name: 'Waffle Cone', price: 1.50 },
      { id: 'addon-25', name: 'Chocolate Sauce', price: 1.00 },
      { id: 'addon-26', name: 'Whipped Cream', price: 0.75 },
    ],
    is_available: true,
    order: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },

  // Beverages
  {
    id: 'item-14',
    tenant_id: 'tenant-1',
    category_id: 'cat-5',
    name: 'Italian Soda',
    description: 'Sparkling water with flavored syrup',
    price: 3.99,
    image_url: 'https://images.unsplash.com/photo-1527761939558-0f431c69de77?w=800',
    variations: [
      { id: 'var-20', name: 'Lemon', price_modifier: 0, is_default: true },
      { id: 'var-21', name: 'Raspberry', price_modifier: 0 },
      { id: 'var-22', name: 'Peach', price_modifier: 0 },
    ],
    addons: [
      { id: 'addon-27', name: 'Add Cream', price: 0.50 },
    ],
    is_available: true,
    order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'item-15',
    tenant_id: 'tenant-1',
    category_id: 'cat-5',
    name: 'Espresso',
    description: 'Strong Italian coffee',
    price: 2.99,
    image_url: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=800',
    variations: [
      { id: 'var-23', name: 'Single', price_modifier: 0, is_default: true },
      { id: 'var-24', name: 'Double', price_modifier: 1.50 },
    ],
    addons: [],
    is_available: true,
    order: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'item-16',
    tenant_id: 'tenant-1',
    category_id: 'cat-5',
    name: 'House Wine',
    description: 'Red or white wine',
    price: 8.99,
    image_url: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800',
    variations: [
      { id: 'var-25', name: 'Glass', price_modifier: 0, is_default: true },
      { id: 'var-26', name: 'Bottle', price_modifier: 20.00 },
    ],
    addons: [],
    is_available: true,
    order: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

// Mock Users
export const mockUsers: User[] = [
  {
    id: 'user-1',
    email: 'superadmin@example.com',
    role: 'superadmin',
    full_name: 'Super Admin',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'user-2',
    email: 'admin@bellaitalia.com',
    role: 'admin',
    tenant_id: 'tenant-1',
    full_name: 'Bella Italia Admin',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

// Helper function to get tenant by slug
export function getTenantBySlug(slug: string): Tenant | undefined {
  return mockTenants.find((tenant) => tenant.slug === slug)
}

// Helper function to get categories by tenant
export function getCategoriesByTenant(tenantId: string): Category[] {
  return mockCategories.filter((category) => category.tenant_id === tenantId)
}

// Helper function to get menu items by tenant
export function getMenuItemsByTenant(tenantId: string): MenuItem[] {
  return mockMenuItems.filter((item) => item.tenant_id === tenantId)
}

// Helper function to get menu items by category
export function getMenuItemsByCategory(categoryId: string): MenuItem[] {
  return mockMenuItems.filter((item) => item.category_id === categoryId)
}

// Helper function to get a single menu item
export function getMenuItemById(itemId: string): MenuItem | undefined {
  return mockMenuItems.find((item) => item.id === itemId)
}

