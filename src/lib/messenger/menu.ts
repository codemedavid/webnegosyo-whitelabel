/**
 * Menu Display Functions
 * Handles displaying categories, menu items, and item details
 */

import { createClient } from '@/lib/supabase/server'
import { sendGenericTemplate, sendButtonTemplate, sendQuickReplies, sendText } from './facebook-api'
import { formatPrice, truncateText, isValidUrl } from './utils'
import { updateSession } from './session'
import type { MessengerSession } from '@/types/messenger'

/**
 * Show menu categories as quick replies
 */
export async function showCategories(
  psid: string,
  tenantId: string,
  session: MessengerSession
): Promise<void> {
  const supabase = await createClient()

  const { data: categories, error } = await supabase
    .from('categories')
    .select('id, name, icon')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('order', { ascending: true })

  if (error) {
    console.error('[Messenger] Error fetching categories:', error)
    await sendText(psid, tenantId, 'Sorry, there was an error loading the menu. Please try again later!')
    return
  }

  if (!categories || categories.length === 0) {
    console.warn(`[Messenger] No categories found for tenant: ${tenantId}`)
    await sendText(psid, tenantId, 'No menu categories available at the moment. Please check back later!')
    return
  }

  const cartCount = session.cart_data.reduce((sum, item) => sum + item.quantity, 0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quickReplies = categories.map((cat: any) => ({
    content_type: 'text' as const,
    title: cat.icon ? `${cat.icon} ${cat.name}` : cat.name,
    payload: `CATEGORY_${cat.id}`,
  }))

  // Add cart button if cart has items
  if (cartCount > 0) {
    quickReplies.push({
      content_type: 'text',
      title: `🛒 View Cart (${cartCount})`,
      payload: 'VIEW_CART',
    })
  }

  await sendQuickReplies(psid, tenantId, '🍽️ Choose a category:', quickReplies)
  await updateSession(psid, { state: 'menu' })
}

/**
 * Show menu items in a category as Generic Template cards
 */
export async function showMenuItems(
  psid: string,
  tenantId: string,
  categoryId: string
): Promise<void> {
  const supabase = await createClient()

  const { data: items, error } = await supabase
    .from('menu_items')
    .select('id, name, description, price, image_url, discounted_price')
    .eq('tenant_id', tenantId)
    .eq('category_id', categoryId)
    .eq('is_available', true)
    .order('order', { ascending: true })

  if (error || !items || items.length === 0) {
    await sendText(psid, tenantId, 'No items available in this category.')
    return
  }

  // Create menu cards (Generic Template)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elements = items.map((item: any) => {
    const price = item.discounted_price || item.price
    const subtitle = `${truncateText(item.description || '', 80)}\n💰 ${formatPrice(price)}`

    // Only include image_url if it's a valid URL (Facebook requires valid absolute URLs)
    const element: {
      title: string
      subtitle: string
      image_url?: string
      buttons: Array<{
        type: 'postback'
        title: string
        payload: string
      }>
    } = {
      title: item.name,
      subtitle,
      buttons: [
        {
          type: 'postback' as const,
          title: '➕ Add to Cart',
          payload: `ADD_${item.id}`,
        },
        {
          type: 'postback' as const,
          title: '👁️ View Details',
          payload: `VIEW_ITEM_${item.id}`,
        },
      ],
    }

    // Only add image_url if it's a valid URL
    if (isValidUrl(item.image_url)) {
      element.image_url = item.image_url
    }

    return element
  })

  await sendGenericTemplate(psid, tenantId, elements)

  // Navigation buttons
  await sendButtonTemplate(psid, tenantId, 'What would you like to do?', [
    { type: 'postback', title: '🔙 Categories', payload: 'SHOW_CATEGORIES' },
    { type: 'postback', title: '🛒 View Cart', payload: 'VIEW_CART' },
  ])
}

/**
 * Show item details with variations/addons options
 */
export async function showItemDetails(
  psid: string,
  tenantId: string,
  itemId: string
): Promise<void> {
  const supabase = await createClient()

  // Get item with variations and addons
  const { data: item, error } = await supabase
    .from('menu_items')
    .select('id, name, description, price, image_url, discounted_price, variations, addons')
    .eq('id', itemId)
    .eq('is_available', true)
    .single()

  if (error || !item) {
    await sendText(psid, tenantId, 'Item not found or no longer available.')
    return
  }

  await updateSession(psid, {
    state: 'selecting_item',
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemData = item as any
  const price = itemData.discounted_price || itemData.price
  let description = `💰 ${formatPrice(price)}\n\n${itemData.description || ''}`

  // Check for variations
  const variations = Array.isArray(itemData.variations) ? itemData.variations : []
  const hasVariations = variations.length > 0

  // Check for addons
  const addons = Array.isArray(itemData.addons) ? itemData.addons : []
  const hasAddons = addons.length > 0

  if (hasVariations) {
    description += '\n\n📋 Variations available'
  }

  if (hasAddons) {
    description += '\n\n➕ Add-ons available'
  }

  // Send item card (only include image_url if it's a valid URL)
  const itemCard: {
    title: string
    subtitle: string
    image_url?: string
    buttons: Array<{
      type: 'postback'
      title: string
      payload: string
    }>
  } = {
    title: itemData.name,
    subtitle: truncateText(description, 80),
    buttons: [
      {
        type: 'postback',
        title: '➕ Add to Cart',
        payload: `ADD_${itemData.id}`,
      },
      {
        type: 'postback',
        title: '🔙 Back to Menu',
        payload: 'SHOW_CATEGORIES',
      },
    ],
  }

  // Only add image_url if it's a valid URL
  if (isValidUrl(itemData.image_url)) {
    itemCard.image_url = itemData.image_url
  }

  await sendGenericTemplate(psid, tenantId, [itemCard])

  // Show variations if available
  if (hasVariations) {
    const quickReplies = variations.slice(0, 10).map((variation: { name: string; id: string; price_modifier?: number }) => ({
      content_type: 'text' as const,
      title: `${variation.name}${variation.price_modifier ? ` (+${formatPrice(variation.price_modifier)})` : ''}`,
      payload: `SELECT_VARIATION_${itemId}_${variation.id}`,
    }))

    // Add "Skip" option for optional variations
    quickReplies.push({
      content_type: 'text',
      title: 'Skip Variations',
      payload: `SKIP_VARIATION_${itemId}`,
    })

    await sendQuickReplies(psid, tenantId, 'Select variation (optional):', quickReplies)
    await updateSession(psid, { state: 'selecting_variation' })
    return
  }

  // Show addons if available and no variations
  if (hasAddons) {
    const quickReplies = addons.slice(0, 10).map((addon: { name: string; id: string; price?: number }) => ({
      content_type: 'text' as const,
      title: `${addon.name}${addon.price ? ` (+${formatPrice(addon.price)})` : ''}`,
      payload: `SELECT_ADDON_${itemId}_${addon.id}`,
    }))

    quickReplies.push({
      content_type: 'text',
      title: 'Done with Add-ons',
      payload: `DONE_ADDONS_${itemId}`,
    })

    await sendQuickReplies(psid, tenantId, 'Select add-ons (optional):', quickReplies)
    await updateSession(psid, { state: 'selecting_addons' })
    return
  }

  // No variations or addons, ask for quantity
  const quantityQuickReplies = Array.from({ length: 10 }, (_, i) => ({
    content_type: 'text' as const,
    title: `${i + 1}`,
    payload: `SET_QUANTITY_${itemId}_${i + 1}`,
  }))

  await sendQuickReplies(psid, tenantId, 'How many would you like?', quantityQuickReplies)
  await updateSession(psid, { state: 'selecting_quantity' })
}

