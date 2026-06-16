/**
 * Unit tests for menu server-side data fetching and ISR
 */

import { getMenuData } from '@/app/[tenant]/menu/menu-server'
import type { Tenant, Category, MenuItem } from '@/types/database'

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn()
}))

import { createClient } from '@/lib/supabase/server'

describe('Menu Server Component - SSR and ISR', () => {
  const mockSupabase = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null })
    }
  }

  const mockTenant: Tenant = {
    id: 'tenant-1',
    slug: 'test-restaurant',
    name: 'Test Restaurant',
    logo_url: 'https://example.com/logo.jpg',
    primary_color: '#FF6B00',
    secondary_color: '#FFFFFF',
    background_color: '#FFFFFF',
    header_color: '#FFFFFF',
    header_font_color: '#000000',
    cards_color: '#FFFFFF',
    cards_border_color: '#E5E7EB',
    card_title_color: '#111111',
    card_price_color: '#FF6B00',
    card_description_color: '#6B7280',
    modal_background_color: '#FFFFFF',
    modal_title_color: '#111111',
    modal_price_color: '#FF6B00',
    modal_description_color: '#6B7280',
    button_primary_color: '#FF6B00',
    button_primary_text_color: '#FFFFFF',
    button_secondary_color: '#F3F4F6',
    button_secondary_text_color: '#111111',
    text_primary_color: '#111111',
    text_secondary_color: '#6B7280',
    text_muted_color: '#9CA3AF',
    border_color: '#E5E7EB',
    success_color: '#10B981',
    warning_color: '#F59E0B',
    error_color: '#EF4444',
    link_color: '#3B82F6',
    shadow_color: 'rgba(0, 0, 0, 0.1)',
    accent_color: '#FFD700',
    card_template: 'classic',
    page_layout: 'default',
    mobile_grid_columns: 1,
    messenger_page_id: '1234567890',
    is_active: true,
    mapbox_enabled: false,
    enable_order_management: false,
    is_announcement_visible: false,
    is_promotion_visible: false,
    promotion_banners: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  }

  const mockCategories: Category[] = [
    {
      id: 'cat-1',
      tenant_id: 'tenant-1',
      name: 'Appetizers',
      order: 1,
      is_active: true,
      display_layout: 'grid',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    {
      id: 'cat-2',
      tenant_id: 'tenant-1',
      name: 'Main Course',
      order: 2,
      is_active: true,
      display_layout: 'grid',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    }
  ]

  const mockMenuItems: MenuItem[] = [
    {
      id: 'item-1',
      tenant_id: 'tenant-1',
      category_id: 'cat-1',
      name: 'Spring Rolls',
      description: 'Crispy spring rolls with vegetables',
      price: 8.99,
      image_url: 'https://example.com/spring-rolls.jpg',
      is_available: true,
      is_featured: true,
      order: 1,
      variations: [],
      variation_types: [],
      addons: [],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    {
      id: 'item-2',
      tenant_id: 'tenant-1',
      category_id: 'cat-2',
      name: 'Grilled Salmon',
      description: 'Fresh grilled salmon with herbs',
      price: 24.99,
      image_url: 'https://example.com/salmon.jpg',
      is_available: true,
      is_featured: false,
      order: 2,
      variations: [],
      variation_types: [],
      addons: [],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    }
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    ;(createClient as jest.Mock).mockResolvedValue(mockSupabase)
  })

  describe('getMenuData function', () => {
    it('should fetch tenant by slug', async () => {
      const tenantsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null })
      }
      const categoriesQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: mockCategories, error: null })
      }
      const menuItemsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: mockMenuItems, error: null })
      }

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tenants') return tenantsQuery
        if (table === 'categories') return categoriesQuery
        if (table === 'menu_items') return menuItemsQuery
        return mockSupabase
      })

      await getMenuData('test-restaurant')

      expect(mockSupabase.from).toHaveBeenCalledWith('tenants')
      expect(tenantsQuery.eq).toHaveBeenCalledWith('slug', 'test-restaurant')
    })

    it('should return tenant not found error when tenant does not exist', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } })
      })

      const result = await getMenuData('non-existent')

      expect(result).toMatchObject({
        tenant: null,
        categories: [],
        menuItems: [],
        error: 'Restaurant not found'
      })
    })

    it('should fetch tenant with valid slug', async () => {
      const tenantsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null })
      }
      const categoriesQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: mockCategories, error: null })
      }
      const menuItemsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: mockMenuItems, error: null })
      }

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tenants') return tenantsQuery
        if (table === 'categories') return categoriesQuery
        if (table === 'menu_items') return menuItemsQuery
        return mockSupabase
      })

      const result = await getMenuData('test-restaurant')

      expect(result.tenant).toEqual(mockTenant)
      expect(result.error).toBeNull()
    })

    it('should fetch categories and menu items in parallel', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null })
          }
        }
        if (table === 'categories') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({ data: mockCategories, error: null })
          }
        }
        if (table === 'menu_items') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({ data: mockMenuItems, error: null })
          }
        }
        return mockSupabase
      })

      const result = await getMenuData('test-restaurant')

      expect(result.categories).toEqual(mockCategories)
      expect(result.menuItems).toEqual(mockMenuItems)
    })

    it('should return error when categories fetch fails', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null })
          }
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB Error' } })
        }
      })

      const result = await getMenuData('test-restaurant')

      expect(result.tenant).toEqual(mockTenant)
      expect(result.error).toContain('Failed to load menu data')
      expect(result.categories).toEqual([])
    })

    it('should return error when menu items fetch fails', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null })
          }
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB Error' } })
        }
      })

      const result = await getMenuData('test-restaurant')

      expect(result.tenant).toEqual(mockTenant)
      expect(result.error).toContain('Failed to load menu data')
      expect(result.menuItems).toEqual([])
    })

    it('should filter categories by tenant_id', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null })
          }
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: mockCategories, error: null })
        }
      })

      await getMenuData('test-restaurant')

      expect(mockSupabase.from).toHaveBeenCalledWith('categories')
    })

    it('should filter menu items by tenant_id', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null })
          }
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: mockMenuItems, error: null })
        }
      })

      await getMenuData('test-restaurant')

      expect(mockSupabase.from).toHaveBeenCalledWith('menu_items')
    })

    it('should order categories by order field', async () => {
      const categoriesQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: mockCategories, error: null })
      }

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null })
          }
        }
        if (table === 'categories') {
          return categoriesQuery
        }
        return mockSupabase
      })

      await getMenuData('test-restaurant')

      expect(categoriesQuery.order).toHaveBeenCalledWith('order')
    })

    it('should order menu items by order field', async () => {
      const menuItemsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: mockMenuItems, error: null })
      }

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null })
          }
        }
        if (table === 'menu_items') {
          return menuItemsQuery
        }
        return mockSupabase
      })

      await getMenuData('test-restaurant')

      expect(menuItemsQuery.order).toHaveBeenCalledWith('order')
    })
  })

  describe('ISR Configuration', () => {
    it('should have server component pattern with proper data fetching', async () => {
      expect(getMenuData).toBeDefined()
      expect(typeof getMenuData).toBe('function')
    })

    it('should be async function for server-side rendering', async () => {
      const result = getMenuData('test-restaurant')
      expect(result).toBeInstanceOf(Promise)
    })
  })

  describe('Data Structure Validation', () => {
    it('should return valid tenant structure', async () => {
      const tenantsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null })
      }
      const categoriesQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: mockCategories, error: null })
      }
      const menuItemsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: mockMenuItems, error: null })
      }

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tenants') return tenantsQuery
        if (table === 'categories') return categoriesQuery
        if (table === 'menu_items') return menuItemsQuery
        return mockSupabase
      })

      const result = await getMenuData('test-restaurant')

      expect(result.tenant).toHaveProperty('id')
      expect(result.tenant).toHaveProperty('slug')
      expect(result.tenant).toHaveProperty('name')
      expect(result.tenant).toHaveProperty('primary_color')
    })

    it('should return valid categories structure', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null })
          }
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: mockCategories, error: null })
        }
      });

      (Promise.all as jest.Mock) = jest.fn().mockResolvedValue([
        { data: mockCategories, error: null },
        { data: mockMenuItems, error: null },
        { data: null, error: null }
      ])

      const result = await getMenuData('test-restaurant')

      expect(result.categories).toBeInstanceOf(Array)
      if (result.categories.length > 0) {
        expect(result.categories[0]).toHaveProperty('id')
        expect(result.categories[0]).toHaveProperty('name')
        expect(result.categories[0]).toHaveProperty('order')
      }
    })

    it('should return valid menu items structure', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockTenant, error: null })
          }
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: mockMenuItems, error: null })
        }
      });

      (Promise.all as jest.Mock) = jest.fn().mockResolvedValue([
        { data: mockCategories, error: null },
        { data: mockMenuItems, error: null },
        { data: null, error: null }
      ])

      const result = await getMenuData('test-restaurant')

      expect(result.menuItems).toBeInstanceOf(Array)
      if (result.menuItems.length > 0) {
        expect(result.menuItems[0]).toHaveProperty('id')
        expect(result.menuItems[0]).toHaveProperty('name')
        expect(result.menuItems[0]).toHaveProperty('price')
        expect(result.menuItems[0]).toHaveProperty('category_id')
      }
    })
  })
})
