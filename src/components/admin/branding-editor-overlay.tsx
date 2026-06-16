'use client'

import { useEffect, useState, useTransition } from 'react'
import { saveBrandingAction } from '@/app/actions/branding'
import type { Tenant, PromotionBanner } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CARD_TEMPLATES } from '@/lib/card-templates'
import { CHECKOUT_TEMPLATES } from '@/lib/checkout-templates'
import { CART_TEMPLATES } from '@/lib/cart-templates'
import { HEADER_TEMPLATES } from '@/lib/header-templates'
import { PAGE_LAYOUTS } from '@/lib/page-layouts'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SimpleImageUpload } from '@/components/shared/simple-image-upload'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FooterView } from '@/components/customer/site-footer'
import { getFooterConfig, type FooterTheme } from '@/lib/footer-utils'
import { toast } from 'sonner'

type BrandingEditorTab = 'colors' | 'header' | 'layouts' | 'cards' | 'checkout' | 'banners' | 'footer'
type MenuBrandingSection = 'main_header' | 'category_navigation' | 'category_header' | 'cart_badge' | 'hero' | 'menu_cards' | 'search_bar'

interface MenuBrandingEditorOpenDetail {
  section?: MenuBrandingSection
}

interface BrandingDraft {
  primary_color: string
  secondary_color: string
  accent_color?: string
  background_color?: string
  header_color?: string
  header_font_color?: string
  cards_color?: string
  cards_border_color?: string
  card_title_color?: string
  card_price_color?: string
  card_description_color?: string
  modal_background_color?: string
  modal_title_color?: string
  modal_price_color?: string
  modal_description_color?: string
  // Checkout interstitial modal colors
  checkout_modal_background_color?: string
  checkout_modal_title_color?: string
  checkout_modal_description_color?: string
  checkout_modal_price_color?: string
  checkout_modal_button_color?: string
  checkout_modal_button_text_color?: string
  checkout_modal_border_color?: string
  button_primary_color?: string
  button_primary_text_color?: string
  button_secondary_color?: string
  button_secondary_text_color?: string
  text_primary_color?: string
  text_secondary_color?: string
  text_muted_color?: string
  menu_main_header_text_color?: string
  menu_main_header_subtitle_color?: string
  menu_category_header_color?: string
  menu_category_active_color?: string
  menu_category_inactive_color?: string
  menu_cart_badge_background_color?: string
  menu_cart_badge_text_color?: string
  border_color?: string
  // Utility colors
  success_color?: string
  warning_color?: string
  error_color?: string
  link_color?: string
  shadow_color?: string
  // Flash Screen
  flash_screen_feature_enabled?: boolean
  flash_screen_is_active?: boolean
  flash_screen_title?: string
  flash_screen_subtitle?: string
  flash_screen_image_url?: string
  flash_screen_background_color?: string
  flash_screen_text_color?: string
  flash_screen_duration_ms?: number
  // Hero customization
  hero_title?: string
  hero_description?: string
  hero_title_color?: string
  hero_description_color?: string
  card_template?: string
  checkout_template?: string
  cart_template?: string
  page_layout?: string
  mobile_grid_columns?: number
  mobile_page_layout?: string | null
  mobile_card_template?: string | null
  // Header template & customization
  header_template?: string
  mobile_header_template?: string | null
  header_show_logo?: boolean
  header_show_name?: boolean
  header_show_cart?: boolean
  header_show_search?: boolean
  header_tagline?: string
  header_tagline_color?: string
  header_sticky?: boolean
  header_blur?: boolean
  header_shadow?: boolean
  header_logo_shape?: 'circle' | 'rounded' | 'square'
  header_height?: 'compact' | 'standard' | 'tall'
  // Search Bar
  search_bar_enabled?: boolean
  search_bar_background?: string
  search_bar_text?: string
  search_bar_placeholder?: string
  search_bar_icon?: string
  search_bar_border?: string
  search_bar_focus_ring?: string
  search_bar_radius?: 'pill' | 'rounded' | 'square'
  search_bar_style?: 'filled' | 'outline' | 'ghost'
  // Banners
  announcement_text?: string
  announcement_bg_color?: string
  announcement_text_color?: string
  is_announcement_visible?: boolean
  promotion_image_url?: string
  is_promotion_visible?: boolean
  promotion_banners?: PromotionBanner[]
  // Footer
  footer_enabled?: boolean
  footer_theme?: FooterTheme
  footer_logo_url?: string
  footer_business_name?: string
  footer_tagline?: string
  footer_address?: string
  footer_phone?: string
  footer_whatsapp?: string
  footer_viber?: string
  footer_email?: string
  footer_facebook_url?: string
  footer_instagram_url?: string
  footer_tiktok_url?: string
  footer_twitter_url?: string
  footer_youtube_url?: string
  footer_facebook_name?: string
  footer_instagram_name?: string
  footer_tiktok_name?: string
  footer_twitter_name?: string
  footer_youtube_name?: string
  footer_about_us?: string
  footer_terms_of_service?: string
  footer_refund_policy?: string
  footer_privacy_policy?: string
  footer_copyright_text?: string
  footer_show_powered_by?: boolean
  footer_powered_by_text?: string
  footer_background_color?: string
  footer_text_color?: string
  footer_heading_color?: string
  footer_link_color?: string
  footer_muted_color?: string
  footer_icon_color?: string
  footer_icon_background_color?: string
  footer_border_color?: string
}

interface BrandingEditorOverlayProps {
  tenant: Tenant
  onPreview: (draft: Partial<BrandingDraft> | null) => void
  onSaved?: (result?: { warning?: string; skippedFields?: string[] }) => void
  onToggleCheckoutPreview?: () => void
}

const FOOTER_THEME_OPTIONS: ReadonlyArray<{ value: FooterTheme; label: string }> = [
  { value: 'auto', label: 'Auto (from branding)' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'brand', label: 'Brand' },
  { value: 'midnight', label: 'Midnight' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'custom', label: 'Custom' },
]

function buildDraftFromTenant(tenant: Tenant): BrandingDraft {
  // Footer columns live on the tenants row but are not declared on the local
  // Tenant type, so read them through an index view.
  const row = tenant as unknown as Record<string, unknown>
  const str = (key: string): string => (typeof row[key] === 'string' ? (row[key] as string) : '')
  return {
    primary_color: tenant.primary_color,
    secondary_color: tenant.secondary_color,
    accent_color: tenant.accent_color || '',
    background_color: tenant.background_color || '',
    header_color: tenant.header_color || '',
    header_font_color: tenant.header_font_color || '',
    cards_color: tenant.cards_color || '',
    cards_border_color: tenant.cards_border_color || '',
    card_title_color: tenant.card_title_color || '',
    card_price_color: tenant.card_price_color || '',
    card_description_color: tenant.card_description_color || '',
    modal_background_color: tenant.modal_background_color || '',
    modal_title_color: tenant.modal_title_color || '',
    modal_price_color: tenant.modal_price_color || '',
    modal_description_color: tenant.modal_description_color || '',
    checkout_modal_background_color: tenant.checkout_modal_background_color || '',
    checkout_modal_title_color: tenant.checkout_modal_title_color || '',
    checkout_modal_description_color: tenant.checkout_modal_description_color || '',
    checkout_modal_price_color: tenant.checkout_modal_price_color || '',
    checkout_modal_button_color: tenant.checkout_modal_button_color || '',
    checkout_modal_button_text_color: tenant.checkout_modal_button_text_color || '',
    checkout_modal_border_color: tenant.checkout_modal_border_color || '',
    button_primary_color: tenant.button_primary_color || '',
    button_primary_text_color: tenant.button_primary_text_color || '',
    button_secondary_color: tenant.button_secondary_color || '',
    button_secondary_text_color: tenant.button_secondary_text_color || '',
    text_primary_color: tenant.text_primary_color || '',
    text_secondary_color: tenant.text_secondary_color || '',
    text_muted_color: tenant.text_muted_color || '',
    menu_main_header_text_color: tenant.menu_main_header_text_color || '',
    menu_main_header_subtitle_color: tenant.menu_main_header_subtitle_color || '',
    menu_category_header_color: tenant.menu_category_header_color || '',
    menu_category_active_color: tenant.menu_category_active_color || '',
    menu_category_inactive_color: tenant.menu_category_inactive_color || '',
    menu_cart_badge_background_color: tenant.menu_cart_badge_background_color || '',
    menu_cart_badge_text_color: tenant.menu_cart_badge_text_color || '',
    border_color: tenant.border_color || '',
    success_color: tenant.success_color || '',
    warning_color: tenant.warning_color || '',
    error_color: tenant.error_color || '',
    link_color: tenant.link_color || '',
    shadow_color: tenant.shadow_color || '',
    flash_screen_feature_enabled: tenant.flash_screen_feature_enabled || false,
    flash_screen_is_active: tenant.flash_screen_is_active || false,
    flash_screen_title: tenant.flash_screen_title || '',
    flash_screen_subtitle: tenant.flash_screen_subtitle || '',
    flash_screen_image_url: tenant.flash_screen_image_url || '',
    flash_screen_background_color: tenant.flash_screen_background_color || '',
    flash_screen_text_color: tenant.flash_screen_text_color || '',
    flash_screen_duration_ms: tenant.flash_screen_duration_ms || 3000,
    hero_title: tenant.hero_title || '',
    hero_description: tenant.hero_description || '',
    hero_title_color: tenant.hero_title_color || '',
    hero_description_color: tenant.hero_description_color || '',
    card_template: tenant.card_template || 'classic',
    checkout_template: tenant.checkout_template || 'classic',
    cart_template: tenant.cart_template || 'classic',
    page_layout: tenant.page_layout || 'default',
    mobile_grid_columns: tenant.mobile_grid_columns || 1,
    mobile_page_layout: tenant.mobile_page_layout || null,
    mobile_card_template: tenant.mobile_card_template || null,
    header_template: tenant.header_template || 'classic',
    mobile_header_template: tenant.mobile_header_template ?? null,
    header_show_logo: tenant.header_show_logo !== false,
    header_show_name: tenant.header_show_name !== false,
    header_show_cart: tenant.header_show_cart !== false,
    header_show_search: tenant.header_show_search === true,
    header_tagline: tenant.header_tagline || '',
    header_tagline_color: tenant.header_tagline_color || '',
    header_sticky: tenant.header_sticky !== false,
    header_blur: tenant.header_blur !== false,
    header_shadow: tenant.header_shadow === true,
    header_logo_shape: tenant.header_logo_shape || 'circle',
    header_height: tenant.header_height || 'standard',
    search_bar_enabled: tenant.search_bar_enabled !== false,
    search_bar_background: tenant.search_bar_background || '',
    search_bar_text: tenant.search_bar_text || '',
    search_bar_placeholder: tenant.search_bar_placeholder || '',
    search_bar_icon: tenant.search_bar_icon || '',
    search_bar_border: tenant.search_bar_border || '',
    search_bar_focus_ring: tenant.search_bar_focus_ring || '',
    search_bar_radius: tenant.search_bar_radius || 'pill',
    search_bar_style: tenant.search_bar_style || 'filled',
    announcement_text: tenant.announcement_text || '',
    announcement_bg_color: tenant.announcement_bg_color || '#FFF4E5',
    announcement_text_color: tenant.announcement_text_color || '#663C00',
    is_announcement_visible: tenant.is_announcement_visible || false,
    promotion_image_url: tenant.promotion_image_url || '',
    is_promotion_visible: tenant.is_promotion_visible || false,
    promotion_banners: tenant.promotion_banners || [],
    footer_enabled: row['footer_enabled'] !== false,
    footer_theme: (str('footer_theme') || 'auto') as FooterTheme,
    footer_logo_url: str('footer_logo_url'),
    footer_business_name: str('footer_business_name'),
    footer_tagline: str('footer_tagline'),
    footer_address: str('footer_address'),
    footer_phone: str('footer_phone'),
    footer_whatsapp: str('footer_whatsapp'),
    footer_viber: str('footer_viber'),
    footer_email: str('footer_email'),
    footer_facebook_url: str('footer_facebook_url'),
    footer_instagram_url: str('footer_instagram_url'),
    footer_tiktok_url: str('footer_tiktok_url'),
    footer_twitter_url: str('footer_twitter_url'),
    footer_youtube_url: str('footer_youtube_url'),
    footer_facebook_name: str('footer_facebook_name'),
    footer_instagram_name: str('footer_instagram_name'),
    footer_tiktok_name: str('footer_tiktok_name'),
    footer_twitter_name: str('footer_twitter_name'),
    footer_youtube_name: str('footer_youtube_name'),
    footer_about_us: str('footer_about_us'),
    footer_terms_of_service: str('footer_terms_of_service'),
    footer_refund_policy: str('footer_refund_policy'),
    footer_privacy_policy: str('footer_privacy_policy'),
    footer_copyright_text: str('footer_copyright_text'),
    footer_show_powered_by: row['footer_show_powered_by'] !== false,
    footer_powered_by_text: str('footer_powered_by_text'),
    footer_background_color: str('footer_background_color'),
    footer_text_color: str('footer_text_color'),
    footer_heading_color: str('footer_heading_color'),
    footer_link_color: str('footer_link_color'),
    footer_muted_color: str('footer_muted_color'),
    footer_icon_color: str('footer_icon_color'),
    footer_icon_background_color: str('footer_icon_background_color'),
    footer_border_color: str('footer_border_color'),
  }
}

export function BrandingEditorOverlay({ tenant, onPreview, onSaved, onToggleCheckoutPreview }: BrandingEditorOverlayProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<BrandingEditorTab>('colors')
  const [focusedMenuSection, setFocusedMenuSection] = useState<MenuBrandingSection | null>(null)
  const [isSaving, startSaving] = useTransition()
  const [draft, setDraft] = useState<BrandingDraft>(() => buildDraftFromTenant(tenant))
  const [layoutScreen, setLayoutScreen] = useState<'desktop' | 'mobile'>('desktop')
  const [cardScreen, setCardScreen] = useState<'desktop' | 'mobile'>('desktop')
  const [headerScreen, setHeaderScreen] = useState<'desktop' | 'mobile'>('desktop')

  useEffect(() => {
    const handleOpenCustomizer = (event: Event) => {
      const detail = (event as CustomEvent<MenuBrandingEditorOpenDetail>).detail
      // The main-header pencil jumps straight to the dedicated Header tab;
      // other sections open the Colors tab focused on that section.
      if (detail?.section === 'main_header') {
        setActiveTab('header')
        setFocusedMenuSection(null)
      } else {
        setActiveTab('colors')
        setFocusedMenuSection(detail?.section ?? null)
      }
      setIsOpen(true)
    }

    window.addEventListener('menu-branding-editor:open', handleOpenCustomizer as EventListener)
    return () => {
      window.removeEventListener('menu-branding-editor:open', handleOpenCustomizer as EventListener)
    }
  }, [])

  // Keep editor state aligned with latest server tenant values after refresh.
  useEffect(() => {
    if (!isOpen) {
      setDraft(buildDraftFromTenant(tenant))
    }
  }, [tenant, isOpen])

  // Live preview hook
  useEffect(() => {
    if (isOpen) onPreview(draft)
    else onPreview(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, draft])

  function updateDraft<K extends keyof BrandingDraft>(key: K, value: BrandingDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  function handleSave() {
    startSaving(async () => {
      const result = await saveBrandingAction(tenant.id, tenant.slug, draft)
      if (result.success) {
        setIsOpen(false)
        setFocusedMenuSection(null)
        onSaved?.({ warning: result.warning, skippedFields: result.skippedFields })
      } else {
        toast.error(result.error || 'Failed to save branding')
        console.error('[BrandingEditor] Save failed:', result.error)
      }
    })
  }

  const menuSectionLabels: Record<MenuBrandingSection, string> = {
    main_header: 'Main Header',
    category_navigation: 'Category Navigation',
    category_header: 'Category Headers',
    cart_badge: 'Cart Badge',
    hero: 'Hero Section',
    menu_cards: 'Menu Cards',
    search_bar: 'Search Bar',
  }

  function renderMenuBrandingSection(section: MenuBrandingSection) {
    if (section === 'main_header') {
      return (
        <Section key={section} title="Main Header" emoji="🏷️">
          <div className="grid gap-3 grid-cols-2">
            <Swatch id="menu_main_header_text_color" label="Title" value={draft.menu_main_header_text_color || ''} onChange={(v) => updateDraft('menu_main_header_text_color', v)} compact />
            <Swatch id="menu_main_header_subtitle_color" label="Subtitle" value={draft.menu_main_header_subtitle_color || ''} onChange={(v) => updateDraft('menu_main_header_subtitle_color', v)} compact />
          </div>
        </Section>
      )
    }

    if (section === 'category_navigation') {
      return (
        <Section key={section} title="Category Navigation" emoji="🧭">
          <div className="grid gap-3 grid-cols-2">
            <Swatch id="menu_category_active_color" label="Active" value={draft.menu_category_active_color || ''} onChange={(v) => updateDraft('menu_category_active_color', v)} compact />
            <Swatch id="menu_category_inactive_color" label="Inactive" value={draft.menu_category_inactive_color || ''} onChange={(v) => updateDraft('menu_category_inactive_color', v)} compact />
          </div>
        </Section>
      )
    }

    if (section === 'category_header') {
      return (
        <Section key={section} title="Category Headers" emoji="📚">
          <div className="grid gap-3 grid-cols-2">
            <Swatch id="menu_category_header_color" label="Header Text" value={draft.menu_category_header_color || ''} onChange={(v) => updateDraft('menu_category_header_color', v)} compact />
          </div>
        </Section>
      )
    }

    if (section === 'cart_badge') {
      return (
        <Section key={section} title="Cart Badge" emoji="🛒">
          <div className="grid gap-3 grid-cols-2">
            <Swatch id="menu_cart_badge_background_color" label="Badge" value={draft.menu_cart_badge_background_color || ''} onChange={(v) => updateDraft('menu_cart_badge_background_color', v)} compact />
            <Swatch id="menu_cart_badge_text_color" label="Number" value={draft.menu_cart_badge_text_color || ''} onChange={(v) => updateDraft('menu_cart_badge_text_color', v)} compact />
          </div>
        </Section>
      )
    }

    if (section === 'hero') {
      return (
        <Section key={section} title="Hero Section" emoji="🏠">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="hero_title_focused" className="text-xs">Hero Title</Label>
              <Input id="hero_title_focused" name="hero_title" value={draft.hero_title || ''} onChange={(e) => updateDraft('hero_title', e.target.value)} placeholder="Our Menu" className="text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hero_description_focused" className="text-xs">Hero Description</Label>
              <Input id="hero_description_focused" name="hero_description" value={draft.hero_description || ''} onChange={(e) => updateDraft('hero_description', e.target.value)} placeholder="Your Smart Ordering Partner" className="text-sm" />
            </div>
            <div className="grid gap-3 grid-cols-2">
              <Swatch id="hero_title_color_focused" label="Title Color" value={draft.hero_title_color || ''} onChange={(v) => updateDraft('hero_title_color', v)} compact />
              <Swatch id="hero_description_color_focused" label="Description Color" value={draft.hero_description_color || ''} onChange={(v) => updateDraft('hero_description_color', v)} compact />
            </div>
          </div>
        </Section>
      )
    }

    if (section === 'search_bar') {
      return (
        <Section key={section} title="Search Bar" emoji="🔎">
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2">
              <span className="text-xs font-medium">Show search bar</span>
              <input
                type="checkbox"
                checked={draft.search_bar_enabled !== false}
                onChange={(e) => updateDraft('search_bar_enabled', e.target.checked)}
                className="h-4 w-4"
              />
            </label>
            <div className="grid gap-3 grid-cols-2">
              <Swatch id="search_bar_background" label="Background" value={draft.search_bar_background || ''} onChange={(v) => updateDraft('search_bar_background', v)} compact />
              <Swatch id="search_bar_text" label="Text" value={draft.search_bar_text || ''} onChange={(v) => updateDraft('search_bar_text', v)} compact />
              <Swatch id="search_bar_placeholder" label="Placeholder" value={draft.search_bar_placeholder || ''} onChange={(v) => updateDraft('search_bar_placeholder', v)} compact />
              <Swatch id="search_bar_icon" label="Icon" value={draft.search_bar_icon || ''} onChange={(v) => updateDraft('search_bar_icon', v)} compact />
              <Swatch id="search_bar_border" label="Border" value={draft.search_bar_border || ''} onChange={(v) => updateDraft('search_bar_border', v)} compact />
              <Swatch id="search_bar_focus_ring" label="Focus Ring" value={draft.search_bar_focus_ring || ''} onChange={(v) => updateDraft('search_bar_focus_ring', v)} compact />
            </div>
            <div className="grid gap-3 grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="search_bar_radius" className="text-xs">Shape</Label>
                <select
                  id="search_bar_radius"
                  value={draft.search_bar_radius || 'pill'}
                  onChange={(e) => updateDraft('search_bar_radius', e.target.value as 'pill' | 'rounded' | 'square')}
                  className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm"
                >
                  <option value="pill">Pill</option>
                  <option value="rounded">Rounded</option>
                  <option value="square">Square</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="search_bar_style" className="text-xs">Style</Label>
                <select
                  id="search_bar_style"
                  value={draft.search_bar_style || 'filled'}
                  onChange={(e) => updateDraft('search_bar_style', e.target.value as 'filled' | 'outline' | 'ghost')}
                  className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm"
                >
                  <option value="filled">Filled</option>
                  <option value="outline">Outline</option>
                  <option value="ghost">Ghost</option>
                </select>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => {
                updateDraft('search_bar_background', '')
                updateDraft('search_bar_text', '')
                updateDraft('search_bar_placeholder', '')
                updateDraft('search_bar_icon', '')
                updateDraft('search_bar_border', '')
                updateDraft('search_bar_focus_ring', '')
                updateDraft('search_bar_radius', 'pill')
                updateDraft('search_bar_style', 'filled')
              }}
            >
              Reset to defaults
            </Button>
          </div>
        </Section>
      )
    }

    // menu_cards
    return (
      <Section key={section} title="Menu Cards" emoji="🃏">
        <div className="grid gap-3 grid-cols-2">
          <Swatch id="cards_color_focused" label="Card Background" value={draft.cards_color || ''} onChange={(v) => updateDraft('cards_color', v)} compact />
          <Swatch id="cards_border_color_focused" label="Card Border" value={draft.cards_border_color || ''} onChange={(v) => updateDraft('cards_border_color', v)} compact />
          <Swatch id="card_title_color_focused" label="Title" value={draft.card_title_color || ''} onChange={(v) => updateDraft('card_title_color', v)} compact />
          <Swatch id="card_price_color_focused" label="Price" value={draft.card_price_color || ''} onChange={(v) => updateDraft('card_price_color', v)} compact />
          <Swatch id="card_description_color_focused" label="Description" value={draft.card_description_color || ''} onChange={(v) => updateDraft('card_description_color', v)} compact />
        </div>
      </Section>
    )
  }

  return (
    <>
      {/* Floating square toggle */}
      <button
        type="button"
        aria-label="Edit branding"
        className="fixed right-4 bottom-6 z-[60] h-12 w-12 rounded-lg border bg-white shadow-lg flex items-center justify-center hover:bg-gray-50"
        onClick={() => {
          setFocusedMenuSection(null)
          setIsOpen((v) => !v)
        }}
        title={isOpen ? 'Close editor' : 'Edit branding'}
      >
        <span className="text-xl">🎨</span>
      </button>

      {/* Floating panel */}
      {isOpen && (
        <div className="fixed right-4 bottom-24 z-[60] w-[420px] max-h-[85vh] overflow-hidden rounded-lg border bg-white shadow-xl flex flex-col">
          {/* Sticky Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎨</span>
              <div>
                <div className="text-sm font-semibold">Branding Editor</div>
                <div className="text-xs text-muted-foreground">Live preview mode</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => {
                setIsOpen(false)
                setFocusedMenuSection(null)
              }}>Close</Button>
              <Button size="sm" disabled={isSaving} onClick={handleSave}>
                {isSaving ? 'Saving…' : '💾 Save'}
              </Button>
            </div>
          </div>

          {/* Tabs for Colors and Card Templates */}
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as BrandingEditorTab)} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="mx-4 mt-4 flex h-auto flex-wrap">
              <TabsTrigger value="colors" className="flex-1">
                <span className="mr-1.5">🎨</span>
                Colors
              </TabsTrigger>
              <TabsTrigger value="header" className="flex-1">
                <span className="mr-1.5">🧱</span>
                Header
              </TabsTrigger>
              <TabsTrigger value="layouts" className="flex-1">
                <span className="mr-1.5">📐</span>
                Layouts
              </TabsTrigger>
              <TabsTrigger value="cards" className="flex-1">
                <span className="mr-1.5">🃏</span>
                Cards
              </TabsTrigger>
              <TabsTrigger value="checkout" className="flex-1">
                <span className="mr-1.5">🛒</span>
                Checkout
              </TabsTrigger>
              <TabsTrigger value="banners" className="flex-1">
                <span className="mr-1.5">📢</span>
                Banners
              </TabsTrigger>
              <TabsTrigger value="footer" className="flex-1">
                <span className="mr-1.5">🔗</span>
                Footer
              </TabsTrigger>
            </TabsList>

            {/* Colors Tab */}
            <TabsContent value="colors" className="flex-1 overflow-y-auto p-4 space-y-6 mt-0">
              {focusedMenuSection ? (
                <>
                  <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-blue-900">
                        Editing: <span className="font-semibold">{menuSectionLabels[focusedMenuSection]}</span>
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs text-blue-900"
                        onClick={() => setFocusedMenuSection(null)}
                      >
                        Show all
                      </Button>
                    </div>
                  </div>
                  {renderMenuBrandingSection(focusedMenuSection)}
                </>
              ) : (
                <>
              {(
                ['main_header', 'category_navigation', 'category_header', 'cart_badge', 'hero', 'search_bar', 'menu_cards'] as MenuBrandingSection[]
              ).map((section) => renderMenuBrandingSection(section))}

              {/* Core Brand Colors */}
              <Section title="Core Brand Colors" emoji="🎨">
                <div className="grid gap-3 grid-cols-2">
                  <Swatch id="primary_color" label="Primary" value={draft.primary_color} onChange={(v) => updateDraft('primary_color', v)} compact />
                  <Swatch id="secondary_color" label="Secondary" value={draft.secondary_color} onChange={(v) => updateDraft('secondary_color', v)} compact />
                  <Swatch id="accent_color" label="Accent" value={draft.accent_color || ''} onChange={(v) => updateDraft('accent_color', v)} compact />
                </div>
              </Section>

              {/* Layout */}
              <Section title="Layout & Background" emoji="📐">
                <div className="grid gap-3 grid-cols-2">
                  <Swatch id="background_color" label="Background" value={draft.background_color || ''} onChange={(v) => updateDraft('background_color', v)} compact />
                  <Swatch id="header_color" label="Header" value={draft.header_color || ''} onChange={(v) => updateDraft('header_color', v)} compact />
                  <Swatch id="header_font_color" label="Header Font" value={draft.header_font_color || ''} onChange={(v) => updateDraft('header_font_color', v)} compact />
                  <Swatch id="border_color" label="Border" value={draft.border_color || ''} onChange={(v) => updateDraft('border_color', v)} compact />
                </div>
              </Section>

              {/* Item Detail Modal */}
              <Section title="Item Detail Modal" emoji="💬">
                <div className="grid gap-3 grid-cols-2">
                  <Swatch id="modal_background_color" label="Background" value={draft.modal_background_color || ''} onChange={(v) => updateDraft('modal_background_color', v)} compact />
                  <Swatch id="modal_title_color" label="Title" value={draft.modal_title_color || ''} onChange={(v) => updateDraft('modal_title_color', v)} compact />
                  <Swatch id="modal_price_color" label="Price" value={draft.modal_price_color || ''} onChange={(v) => updateDraft('modal_price_color', v)} compact />
                  <Swatch id="modal_description_color" label="Description" value={draft.modal_description_color || ''} onChange={(v) => updateDraft('modal_description_color', v)} compact />
                </div>
              </Section>

              {/* Checkout Interstitial */}
              <Section title="Checkout Interstitial" emoji="🛒">
                <div className="grid gap-3 grid-cols-2">
                  <Swatch id="checkout_modal_background_color" label="Background" value={draft.checkout_modal_background_color || ''} onChange={(v) => updateDraft('checkout_modal_background_color', v)} compact />
                  <Swatch id="checkout_modal_title_color" label="Title" value={draft.checkout_modal_title_color || ''} onChange={(v) => updateDraft('checkout_modal_title_color', v)} compact />
                  <Swatch id="checkout_modal_description_color" label="Description" value={draft.checkout_modal_description_color || ''} onChange={(v) => updateDraft('checkout_modal_description_color', v)} compact />
                  <Swatch id="checkout_modal_price_color" label="Price" value={draft.checkout_modal_price_color || ''} onChange={(v) => updateDraft('checkout_modal_price_color', v)} compact />
                  <Swatch id="checkout_modal_button_color" label="Button" value={draft.checkout_modal_button_color || ''} onChange={(v) => updateDraft('checkout_modal_button_color', v)} compact />
                  <Swatch id="checkout_modal_button_text_color" label="Button Text" value={draft.checkout_modal_button_text_color || ''} onChange={(v) => updateDraft('checkout_modal_button_text_color', v)} compact />
                  <Swatch id="checkout_modal_border_color" label="Border" value={draft.checkout_modal_border_color || ''} onChange={(v) => updateDraft('checkout_modal_border_color', v)} compact />
                </div>
                {onToggleCheckoutPreview && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full mt-3 text-sm"
                    onClick={onToggleCheckoutPreview}
                  >
                    Preview Checkout Modal
                  </Button>
                )}
              </Section>

              {/* Buttons */}
              <Section title="Buttons" emoji="🔘">
                <div className="grid gap-3 grid-cols-2">
                  <Swatch id="button_primary_color" label="Primary" value={draft.button_primary_color || ''} onChange={(v) => updateDraft('button_primary_color', v)} compact />
                  <Swatch id="button_primary_text_color" label="Primary Text" value={draft.button_primary_text_color || ''} onChange={(v) => updateDraft('button_primary_text_color', v)} compact />
                  <Swatch id="button_secondary_color" label="Secondary" value={draft.button_secondary_color || ''} onChange={(v) => updateDraft('button_secondary_color', v)} compact />
                  <Swatch id="button_secondary_text_color" label="Secondary Text" value={draft.button_secondary_text_color || ''} onChange={(v) => updateDraft('button_secondary_text_color', v)} compact />
                </div>
              </Section>

              {/* Text Colors */}
              <Section title="Text Colors" emoji="📝">
                <div className="grid gap-3 grid-cols-2">
                  <Swatch id="text_primary_color" label="Primary" value={draft.text_primary_color || ''} onChange={(v) => updateDraft('text_primary_color', v)} compact />
                  <Swatch id="text_secondary_color" label="Secondary" value={draft.text_secondary_color || ''} onChange={(v) => updateDraft('text_secondary_color', v)} compact />
                  <Swatch id="text_muted_color" label="Muted" value={draft.text_muted_color || ''} onChange={(v) => updateDraft('text_muted_color', v)} compact />
                </div>
              </Section>

              {/* Utility Colors */}
              <Section title="Utility Colors" emoji="🎨">
                <div className="grid gap-3 grid-cols-2">
                  <Swatch id="success_color" label="Success" value={draft.success_color || ''} onChange={(v) => updateDraft('success_color', v)} compact />
                  <Swatch id="warning_color" label="Warning" value={draft.warning_color || ''} onChange={(v) => updateDraft('warning_color', v)} compact />
                  <Swatch id="error_color" label="Error" value={draft.error_color || ''} onChange={(v) => updateDraft('error_color', v)} compact />
                  <Swatch id="link_color" label="Link" value={draft.link_color || ''} onChange={(v) => updateDraft('link_color', v)} compact />
                  <Swatch id="shadow_color" label="Shadow" value={draft.shadow_color || ''} onChange={(v) => updateDraft('shadow_color', v)} compact />
                </div>
              </Section>

              {/* Flash Screen */}
              <Section title="Flash Screen" emoji="⚡">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="flash_screen_feature_enabled"
                      checked={draft.flash_screen_feature_enabled}
                      onChange={(e) => updateDraft('flash_screen_feature_enabled', e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="flash_screen_feature_enabled">Enable Flash Screen</Label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="flash_screen_is_active"
                      checked={draft.flash_screen_is_active}
                      onChange={(e) => updateDraft('flash_screen_is_active', e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="flash_screen_is_active">Active</Label>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="flash_screen_title" className="text-xs">Title</Label>
                    <Input
                      id="flash_screen_title"
                      value={draft.flash_screen_title || ''}
                      onChange={(e) => updateDraft('flash_screen_title', e.target.value)}
                      placeholder="Welcome!"
                      className="text-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="flash_screen_subtitle" className="text-xs">Subtitle</Label>
                    <Input
                      id="flash_screen_subtitle"
                      value={draft.flash_screen_subtitle || ''}
                      onChange={(e) => updateDraft('flash_screen_subtitle', e.target.value)}
                      placeholder="Loading your experience..."
                      className="text-sm"
                    />
                  </div>

                  <SimpleImageUpload
                    label="Image"
                    folder="flash-screens"
                    currentImageUrl={draft.flash_screen_image_url || ''}
                    onImageUploaded={(url) => updateDraft('flash_screen_image_url', url)}
                    description="Recommended: Square or portrait image"
                  />

                  <div className="grid gap-3 grid-cols-2">
                    <Swatch id="flash_screen_background_color" label="Background" value={draft.flash_screen_background_color || ''} onChange={(v) => updateDraft('flash_screen_background_color', v)} compact />
                    <Swatch id="flash_screen_text_color" label="Text Color" value={draft.flash_screen_text_color || ''} onChange={(v) => updateDraft('flash_screen_text_color', v)} compact />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="flash_screen_duration_ms" className="text-xs">Duration (ms)</Label>
                    <Input
                      id="flash_screen_duration_ms"
                      type="number"
                      value={draft.flash_screen_duration_ms || 3000}
                      onChange={(e) => updateDraft('flash_screen_duration_ms', parseInt(e.target.value, 10) || 3000)}
                      placeholder="3000"
                      className="text-sm"
                      min={500}
                      max={10000}
                      step={500}
                    />
                  </div>
                </div>
              </Section>
                </>
              )}
            </TabsContent>

            {/* Header Tab */}
            <TabsContent value="header" className="flex-1 overflow-y-auto p-4 mt-0">
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-gray-900">Choose Your Header Style</h3>
                    <p className="text-xs text-muted-foreground">
                      Select a layout for your menu&apos;s main header bar.
                    </p>
                  </div>
                  <ScreenToggle value={headerScreen} onChange={setHeaderScreen} />
                </div>

                {headerScreen === 'mobile' && !draft.mobile_header_template && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="text-xs text-amber-900">
                      Currently using the desktop header. Pick a different style to customize mobile separately.
                    </p>
                  </div>
                )}

                {headerScreen === 'mobile' && draft.mobile_header_template && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                      onClick={() => updateDraft('mobile_header_template', null)}
                    >
                      Reset to desktop header
                    </button>
                  </div>
                )}

                <div className="grid gap-4">
                  {HEADER_TEMPLATES.map((template) => {
                    const activeTemplate = headerScreen === 'desktop'
                      ? (draft.header_template || 'classic')
                      : (draft.mobile_header_template || draft.header_template || 'classic')
                    const isActive = activeTemplate === template.id

                    return (
                      <button
                        key={template.id}
                        type="button"
                        className="relative text-left rounded-xl border-2 p-4 transition-all hover:shadow-md"
                        style={{
                          borderColor: isActive ? draft.primary_color : '#e5e7eb',
                          backgroundColor: isActive ? `${draft.primary_color}10` : '#ffffff'
                        }}
                        onClick={() => {
                          if (headerScreen === 'desktop') {
                            updateDraft('header_template', template.id)
                          } else {
                            updateDraft('mobile_header_template', template.id)
                          }
                        }}
                      >
                        {isActive && (
                          <div
                            className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-white text-xs font-bold"
                            style={{ backgroundColor: draft.primary_color }}
                          >
                            ✓
                          </div>
                        )}

                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 text-3xl">{template.preview}</div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm mb-1">{template.name}</h4>
                            <p className="text-xs text-muted-foreground mb-2">{template.description}</p>
                            <div className="flex flex-wrap gap-1">
                              {template.features.map((feature, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                                  style={{
                                    backgroundColor: isActive ? draft.primary_color : '#f3f4f6',
                                    color: isActive ? '#ffffff' : '#6b7280'
                                  }}
                                >
                                  {feature}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* Header elements */}
                <div className="pt-4 border-t space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900">Header Elements</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2">
                      <span className="text-xs font-medium">Show logo</span>
                      <input type="checkbox" checked={draft.header_show_logo !== false} onChange={(e) => updateDraft('header_show_logo', e.target.checked)} className="h-4 w-4" />
                    </label>
                    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2">
                      <span className="text-xs font-medium">Show name</span>
                      <input type="checkbox" checked={draft.header_show_name !== false} onChange={(e) => updateDraft('header_show_name', e.target.checked)} className="h-4 w-4" />
                    </label>
                    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2">
                      <span className="text-xs font-medium">Show cart</span>
                      <input type="checkbox" checked={draft.header_show_cart !== false} onChange={(e) => updateDraft('header_show_cart', e.target.checked)} className="h-4 w-4" />
                    </label>
                    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2">
                      <span className="text-xs font-medium">Show search</span>
                      <input type="checkbox" checked={draft.header_show_search === true} onChange={(e) => updateDraft('header_show_search', e.target.checked)} className="h-4 w-4" />
                    </label>
                    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2">
                      <span className="text-xs font-medium">Sticky on scroll</span>
                      <input type="checkbox" checked={draft.header_sticky !== false} onChange={(e) => updateDraft('header_sticky', e.target.checked)} className="h-4 w-4" />
                    </label>
                    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2">
                      <span className="text-xs font-medium">Blur background</span>
                      <input type="checkbox" checked={draft.header_blur !== false} onChange={(e) => updateDraft('header_blur', e.target.checked)} className="h-4 w-4" />
                    </label>
                    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2">
                      <span className="text-xs font-medium">Drop shadow</span>
                      <input type="checkbox" checked={draft.header_shadow === true} onChange={(e) => updateDraft('header_shadow', e.target.checked)} className="h-4 w-4" />
                    </label>
                  </div>
                </div>

                {/* Tagline, logo shape & height */}
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="header_tagline" className="text-xs">Tagline (optional)</Label>
                    <Input id="header_tagline" value={draft.header_tagline || ''} onChange={(e) => updateDraft('header_tagline', e.target.value)} placeholder="e.g., Freshly brewed daily" className="text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="header_logo_shape" className="text-xs">Logo shape</Label>
                      <select id="header_logo_shape" value={draft.header_logo_shape || 'circle'} onChange={(e) => updateDraft('header_logo_shape', e.target.value as 'circle' | 'rounded' | 'square')} className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm">
                        <option value="circle">Circle</option>
                        <option value="rounded">Rounded</option>
                        <option value="square">Square</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="header_height" className="text-xs">Header height</Label>
                      <select id="header_height" value={draft.header_height || 'standard'} onChange={(e) => updateDraft('header_height', e.target.value as 'compact' | 'standard' | 'tall')} className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm">
                        <option value="compact">Compact</option>
                        <option value="standard">Standard</option>
                        <option value="tall">Tall</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Header colors */}
                <div className="pt-4 border-t space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900">Header Colors</h3>
                  <div className="grid gap-3 grid-cols-2">
                    <Swatch id="header_color_h" label="Background" value={draft.header_color || ''} onChange={(v) => updateDraft('header_color', v)} compact />
                    <Swatch id="header_font_color_h" label="Header Font" value={draft.header_font_color || ''} onChange={(v) => updateDraft('header_font_color', v)} compact />
                    <Swatch id="menu_main_header_text_color_h" label="Title" value={draft.menu_main_header_text_color || ''} onChange={(v) => updateDraft('menu_main_header_text_color', v)} compact />
                    <Swatch id="header_tagline_color_h" label="Tagline" value={draft.header_tagline_color || ''} onChange={(v) => updateDraft('header_tagline_color', v)} compact />
                    <Swatch id="border_color_h" label="Border" value={draft.border_color || ''} onChange={(v) => updateDraft('border_color', v)} compact />
                    <Swatch id="menu_cart_badge_background_color_h" label="Cart Badge" value={draft.menu_cart_badge_background_color || ''} onChange={(v) => updateDraft('menu_cart_badge_background_color', v)} compact />
                    <Swatch id="menu_cart_badge_text_color_h" label="Cart Number" value={draft.menu_cart_badge_text_color || ''} onChange={(v) => updateDraft('menu_cart_badge_text_color', v)} compact />
                  </div>
                </div>

                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                  <div className="flex items-start gap-2">
                    <span className="text-sm">💡</span>
                    <p className="text-xs text-blue-700">Changes preview live on your menu header. Don&apos;t forget to save!</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Layouts Tab */}
            <TabsContent value="layouts" className="flex-1 overflow-y-auto p-4 mt-0">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-gray-900">Choose Your Page Layout</h3>
                    <p className="text-xs text-muted-foreground">
                      Select how your menu page is structured.
                    </p>
                  </div>
                  <ScreenToggle value={layoutScreen} onChange={setLayoutScreen} />
                </div>

                {layoutScreen === 'mobile' && !draft.mobile_page_layout && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="text-xs text-amber-900">
                      Currently using the desktop layout. Pick a different layout to customize mobile separately.
                    </p>
                  </div>
                )}

                {layoutScreen === 'mobile' && draft.mobile_page_layout && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                      onClick={() => updateDraft('mobile_page_layout', null)}
                    >
                      Reset to desktop layout
                    </button>
                  </div>
                )}

                <div className="grid gap-4">
                  {PAGE_LAYOUTS.map((layout) => {
                    const activeLayout = layoutScreen === 'desktop'
                      ? draft.page_layout
                      : (draft.mobile_page_layout || draft.page_layout)
                    const isActive = activeLayout === layout.id

                    return (
                      <button
                        key={layout.id}
                        type="button"
                        className="relative text-left rounded-xl border-2 p-4 transition-all hover:shadow-md"
                        style={{
                          borderColor: isActive ? draft.primary_color : '#e5e7eb',
                          backgroundColor: isActive ? `${draft.primary_color}10` : '#ffffff'
                        }}
                        onClick={() => {
                          if (layoutScreen === 'desktop') {
                            updateDraft('page_layout', layout.id)
                          } else {
                            updateDraft('mobile_page_layout', layout.id)
                          }
                        }}
                      >
                        {isActive && (
                          <div
                            className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-white text-xs font-bold"
                            style={{ backgroundColor: draft.primary_color }}
                          >
                            ✓
                          </div>
                        )}

                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 text-3xl">{layout.preview}</div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm mb-1">{layout.name}</h4>
                            <p className="text-xs text-muted-foreground mb-2">{layout.description}</p>
                            <div className="flex flex-wrap gap-1">
                              {layout.features.map((feature, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                                  style={{
                                    backgroundColor: isActive
                                      ? draft.primary_color
                                      : '#f3f4f6',
                                    color: isActive
                                      ? '#ffffff'
                                      : '#6b7280'
                                  }}
                                >
                                  {feature}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>

                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-sm">💡</span>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-blue-900">Preview Your Selection</p>
                      <p className="text-xs text-blue-700 mt-0.5">
                        The layout changes are shown in real-time. Don&apos;t forget to save!
                      </p>
                    </div>
                  </div>
                </div>

                {/* Mobile Grid Columns */}
                <div className="pt-4 border-t space-y-3">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-gray-900">Mobile Grid Layout</h3>
                    <p className="text-xs text-muted-foreground">
                      Choose how many cards to show per row on mobile devices.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => updateDraft('mobile_grid_columns', 1)}
                      className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all"
                      style={{
                        borderColor: draft.mobile_grid_columns === 1 ? draft.primary_color : '#e5e7eb',
                        backgroundColor: draft.mobile_grid_columns === 1 ? `${draft.primary_color}10` : '#ffffff'
                      }}
                    >
                      <div className="w-full flex justify-center">
                        <div className="w-12 h-16 rounded bg-gray-200" />
                      </div>
                      <span className="text-xs font-medium">1 Card</span>
                      <span className="text-[10px] text-muted-foreground">Full width</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => updateDraft('mobile_grid_columns', 2)}
                      className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all"
                      style={{
                        borderColor: draft.mobile_grid_columns === 2 ? draft.primary_color : '#e5e7eb',
                        backgroundColor: draft.mobile_grid_columns === 2 ? `${draft.primary_color}10` : '#ffffff'
                      }}
                    >
                      <div className="w-full flex justify-center gap-1">
                        <div className="w-6 h-16 rounded bg-gray-200" />
                        <div className="w-6 h-16 rounded bg-gray-200" />
                      </div>
                      <span className="text-xs font-medium">2 Cards</span>
                      <span className="text-[10px] text-muted-foreground">Side by side</span>
                    </button>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Card Templates Tab */}
            <TabsContent value="cards" className="flex-1 overflow-y-auto p-4 mt-0">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-gray-900">Choose Your Card Design</h3>
                    <p className="text-xs text-muted-foreground">
                      Select a card template that best represents your brand.
                    </p>
                  </div>
                  <ScreenToggle value={cardScreen} onChange={setCardScreen} />
                </div>

                {cardScreen === 'mobile' && !draft.mobile_card_template && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="text-xs text-amber-900">
                      Currently using the desktop card template. Pick a different template to customize mobile separately.
                    </p>
                  </div>
                )}

                {cardScreen === 'mobile' && draft.mobile_card_template && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                      onClick={() => updateDraft('mobile_card_template', null)}
                    >
                      Reset to desktop card template
                    </button>
                  </div>
                )}

                <div className="grid gap-4">
                  {CARD_TEMPLATES.map((template) => {
                    const activeTemplate = cardScreen === 'desktop'
                      ? draft.card_template
                      : (draft.mobile_card_template || draft.card_template)
                    const isActive = activeTemplate === template.id

                    return (
                      <button
                        key={template.id}
                        type="button"
                        className="relative text-left rounded-xl border-2 p-4 transition-all hover:shadow-md"
                        style={{
                          borderColor: isActive ? draft.primary_color : '#e5e7eb',
                          backgroundColor: isActive ? `${draft.primary_color}10` : '#ffffff'
                        }}
                        onClick={() => {
                          if (cardScreen === 'desktop') {
                            updateDraft('card_template', template.id)
                          } else {
                            updateDraft('mobile_card_template', template.id)
                          }
                        }}
                      >
                        {isActive && (
                          <div
                            className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-white text-xs font-bold"
                            style={{ backgroundColor: draft.primary_color }}
                          >
                            ✓
                          </div>
                        )}

                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 text-3xl">{template.preview}</div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm mb-1">{template.name}</h4>
                            <p className="text-xs text-muted-foreground mb-2">{template.description}</p>
                            <div className="flex flex-wrap gap-1">
                              {template.features.map((feature, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                                  style={{
                                    backgroundColor: isActive
                                      ? draft.primary_color
                                      : '#f3f4f6',
                                    color: isActive
                                      ? '#ffffff'
                                      : '#6b7280'
                                  }}
                                >
                                  {feature}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>

                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-sm">💡</span>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-blue-900">Preview Your Selection</p>
                      <p className="text-xs text-blue-700 mt-0.5">
                        Changes are shown in real-time on your menu page. Don&apos;t forget to save!
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Checkout & Cart Designs Tab */}
            <TabsContent value="checkout" className="flex-1 overflow-y-auto p-4 space-y-8 mt-0">
              {/* Checkout page design */}
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-gray-900">Checkout Page Design</h3>
                  <p className="text-xs text-muted-foreground">
                    Choose how your checkout page looks. Every design uses your brand colors automatically.
                  </p>
                </div>

                <div className="grid gap-4">
                  {CHECKOUT_TEMPLATES.map((template) => {
                    const isActive = (draft.checkout_template || 'classic') === template.id
                    return (
                      <button
                        key={template.id}
                        type="button"
                        className="relative text-left rounded-xl border-2 p-4 transition-all hover:shadow-md"
                        style={{
                          borderColor: isActive ? draft.primary_color : '#e5e7eb',
                          backgroundColor: isActive ? `${draft.primary_color}10` : '#ffffff',
                        }}
                        onClick={() => updateDraft('checkout_template', template.id)}
                      >
                        {isActive && (
                          <div
                            className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-white text-xs font-bold"
                            style={{ backgroundColor: draft.primary_color }}
                          >
                            ✓
                          </div>
                        )}
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 text-3xl">{template.preview}</div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm mb-1">{template.name}</h4>
                            <p className="text-xs text-muted-foreground mb-2">{template.description}</p>
                            <div className="flex flex-wrap gap-1">
                              {template.features.map((feature, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                                  style={{
                                    backgroundColor: isActive ? draft.primary_color : '#f3f4f6',
                                    color: isActive ? '#ffffff' : '#6b7280',
                                  }}
                                >
                                  {feature}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Cart page design */}
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-gray-900">Cart Page Design</h3>
                  <p className="text-xs text-muted-foreground">
                    Choose how your shopping cart page looks.
                  </p>
                </div>

                <div className="grid gap-4">
                  {CART_TEMPLATES.map((template) => {
                    const isActive = (draft.cart_template || 'classic') === template.id
                    return (
                      <button
                        key={template.id}
                        type="button"
                        className="relative text-left rounded-xl border-2 p-4 transition-all hover:shadow-md"
                        style={{
                          borderColor: isActive ? draft.primary_color : '#e5e7eb',
                          backgroundColor: isActive ? `${draft.primary_color}10` : '#ffffff',
                        }}
                        onClick={() => updateDraft('cart_template', template.id)}
                      >
                        {isActive && (
                          <div
                            className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-white text-xs font-bold"
                            style={{ backgroundColor: draft.primary_color }}
                          >
                            ✓
                          </div>
                        )}
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 text-3xl">{template.preview}</div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm mb-1">{template.name}</h4>
                            <p className="text-xs text-muted-foreground mb-2">{template.description}</p>
                            <div className="flex flex-wrap gap-1">
                              {template.features.map((feature, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                                  style={{
                                    backgroundColor: isActive ? draft.primary_color : '#f3f4f6',
                                    color: isActive ? '#ffffff' : '#6b7280',
                                  }}
                                >
                                  {feature}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                <div className="flex items-start gap-2">
                  <span className="text-sm">💡</span>
                  <p className="text-xs text-blue-700">
                    Save your changes, then open your Cart and Checkout pages to see the new design. Designs inherit your brand colors.
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* Banners Tab */}
            <TabsContent value="banners" className="flex-1 overflow-y-auto p-4 space-y-6 mt-0">
              {/* Announcement Banner */}
              <Section title="Announcement Banner" emoji="📢">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_announcement_visible"
                      checked={draft.is_announcement_visible}
                      onChange={(e) => updateDraft('is_announcement_visible', e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="is_announcement_visible">Show Announcement Banner</Label>
                  </div>

                  {draft.is_announcement_visible && (
                    <div className="space-y-3 pl-6 border-l-2 border-gray-100">
                      <div className="space-y-1">
                        <Label htmlFor="announcement_text" className="text-xs">Announcement Text</Label>
                        <Input
                          id="announcement_text"
                          value={draft.announcement_text || ''}
                          onChange={(e) => updateDraft('announcement_text', e.target.value)}
                          placeholder="e.g., We are open for dine-in!"
                          className="text-sm"
                        />
                      </div>
                      <div className="grid gap-3 grid-cols-2">
                        <Swatch
                          id="announcement_bg_color"
                          label="Background Color"
                          value={draft.announcement_bg_color || '#FFF4E5'}
                          onChange={(v) => updateDraft('announcement_bg_color', v)}
                          compact
                        />
                        <Swatch
                          id="announcement_text_color"
                          label="Text Color"
                          value={draft.announcement_text_color || '#663C00'}
                          onChange={(v) => updateDraft('announcement_text_color', v)}
                          compact
                        />
                      </div>
                    </div>
                  )}
                </div>
              </Section>

              {/* Promotion Banner */}
              <Section title="Promotion Banners" emoji="🎉">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_promotion_visible"
                      checked={draft.is_promotion_visible}
                      onChange={(e) => updateDraft('is_promotion_visible', e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="is_promotion_visible">Show Promotion Banners</Label>
                  </div>

                  {draft.is_promotion_visible && (
                    <div className="space-y-4 pl-6 border-l-2 border-gray-100">
                      {(draft.promotion_banners || []).map((banner, index) => (
                        <div key={banner.id} className="p-3 border rounded-lg bg-gray-50 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-medium text-gray-600">Banner {index + 1}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const newBanners = (draft.promotion_banners || []).filter((_, i) => i !== index)
                                updateDraft('promotion_banners', newBanners)
                              }}
                              className="text-red-500 hover:text-red-700 text-xs"
                            >
                              Remove
                            </button>
                          </div>
                          <SimpleImageUpload
                            label="Image"
                            folder="banners"
                            currentImageUrl={banner.imageUrl}
                            onImageUploaded={(url) => {
                              const newBanners = [...(draft.promotion_banners || [])]
                              newBanners[index] = { ...newBanners[index], imageUrl: url }
                              updateDraft('promotion_banners', newBanners)
                            }}
                            description="Recommended: Landscape (21:9)"
                          />
                          <div className="space-y-1">
                            <Label className="text-xs">Title (optional)</Label>
                            <Input
                              value={banner.title || ''}
                              onChange={(e) => {
                                const newBanners = [...(draft.promotion_banners || [])]
                                newBanners[index] = { ...newBanners[index], title: e.target.value }
                                updateDraft('promotion_banners', newBanners)
                              }}
                              placeholder="e.g., Summer Sale!"
                              className="text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Description (optional)</Label>
                            <Input
                              value={banner.description || ''}
                              onChange={(e) => {
                                const newBanners = [...(draft.promotion_banners || [])]
                                newBanners[index] = { ...newBanners[index], description: e.target.value }
                                updateDraft('promotion_banners', newBanners)
                              }}
                              placeholder="e.g., 50% off all drinks"
                              className="text-sm"
                            />
                          </div>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newBanner: PromotionBanner = {
                            id: crypto.randomUUID(),
                            imageUrl: '',
                            title: '',
                            description: '',
                          }
                          updateDraft('promotion_banners', [...(draft.promotion_banners || []), newBanner])
                        }}
                        className="w-full"
                      >
                        + Add Banner
                      </Button>
                    </div>
                  )}
                </div>
              </Section>
            </TabsContent>

            {/* Footer Tab */}
            <TabsContent value="footer" className="flex-1 overflow-y-auto p-4 space-y-6 mt-0">
              {/* General */}
              <Section title="Footer" emoji="🔗">
                <div className="space-y-3">
                  <label className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2">
                    <span className="text-xs font-medium">Show footer</span>
                    <input
                      type="checkbox"
                      checked={draft.footer_enabled !== false}
                      onChange={(e) => updateDraft('footer_enabled', e.target.checked)}
                      className="h-4 w-4"
                    />
                  </label>

                  <div className="space-y-1">
                    <Label htmlFor="footer_theme" className="text-xs">Theme</Label>
                    <Select
                      value={draft.footer_theme || 'auto'}
                      onValueChange={(value) => updateDraft('footer_theme', value as FooterTheme)}
                    >
                      <SelectTrigger id="footer_theme" className="w-full text-sm">
                        <SelectValue placeholder="Select a theme" />
                      </SelectTrigger>
                      <SelectContent>
                        {FOOTER_THEME_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">Pick a preset, or choose Custom and set colors below.</p>
                  </div>

                  <SimpleImageUpload
                    label="Footer Logo"
                    folder="tenants/footer"
                    currentImageUrl={draft.footer_logo_url || ''}
                    onImageUploaded={(url) => updateDraft('footer_logo_url', url)}
                    description="Optional logo shown at the top of the footer"
                  />

                  <div className="space-y-1">
                    <Label htmlFor="footer_business_name" className="text-xs">Business Name</Label>
                    <Input id="footer_business_name" value={draft.footer_business_name || ''} onChange={(e) => updateDraft('footer_business_name', e.target.value)} placeholder={tenant.name} className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="footer_tagline" className="text-xs">Tagline</Label>
                    <Input id="footer_tagline" value={draft.footer_tagline || ''} onChange={(e) => updateDraft('footer_tagline', e.target.value)} placeholder="A short line about your business" className="text-sm" />
                  </div>
                </div>
              </Section>

              {/* Contact */}
              <Section title="Contact" emoji="📇">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="footer_address" className="text-xs">Address</Label>
                    <Textarea id="footer_address" value={draft.footer_address || ''} onChange={(e) => updateDraft('footer_address', e.target.value)} placeholder="123 Main St, City, Country" rows={2} className="text-sm" />
                  </div>
                  <div className="grid gap-3 grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="footer_phone" className="text-xs">Phone</Label>
                      <Input id="footer_phone" value={draft.footer_phone || ''} onChange={(e) => updateDraft('footer_phone', e.target.value)} placeholder="+63 900 000 0000" className="text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="footer_whatsapp" className="text-xs">WhatsApp</Label>
                      <Input id="footer_whatsapp" value={draft.footer_whatsapp || ''} onChange={(e) => updateDraft('footer_whatsapp', e.target.value)} placeholder="+63 900 000 0000" className="text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="footer_viber" className="text-xs">Viber</Label>
                      <Input id="footer_viber" value={draft.footer_viber || ''} onChange={(e) => updateDraft('footer_viber', e.target.value)} placeholder="+63 900 000 0000" className="text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="footer_email" className="text-xs">Email</Label>
                      <Input id="footer_email" type="email" value={draft.footer_email || ''} onChange={(e) => updateDraft('footer_email', e.target.value)} placeholder="hello@example.com" className="text-sm" />
                    </div>
                  </div>
                </div>
              </Section>

              {/* Social */}
              <Section title="Social Links" emoji="🌐">
                <p className="text-[11px] text-muted-foreground mb-2">Add a link and an optional name shown beside the icon. Leave the name blank to use the platform name.</p>
                <div className="space-y-4">
                  {([
                    { platform: 'facebook', label: 'Facebook', urlPlaceholder: 'https://facebook.com/yourpage' },
                    { platform: 'instagram', label: 'Instagram', urlPlaceholder: 'https://instagram.com/yourhandle' },
                    { platform: 'tiktok', label: 'TikTok', urlPlaceholder: 'https://tiktok.com/@yourhandle' },
                    { platform: 'twitter', label: 'Twitter / X', urlPlaceholder: 'https://x.com/yourhandle' },
                    { platform: 'youtube', label: 'YouTube', urlPlaceholder: 'https://youtube.com/@yourchannel' },
                  ] as const).map(({ platform, label, urlPlaceholder }) => {
                    const urlKey = `footer_${platform}_url` as keyof BrandingDraft
                    const nameKey = `footer_${platform}_name` as keyof BrandingDraft
                    return (
                      <div key={platform} className="space-y-1.5 rounded-md border border-gray-100 p-2.5">
                        <Label className="text-xs font-semibold">{label}</Label>
                        <Input
                          id={urlKey}
                          value={(draft[urlKey] as string) || ''}
                          onChange={(e) => updateDraft(urlKey, e.target.value)}
                          placeholder={urlPlaceholder}
                          className="text-sm"
                        />
                        <Input
                          id={nameKey}
                          value={(draft[nameKey] as string) || ''}
                          onChange={(e) => updateDraft(nameKey, e.target.value)}
                          placeholder={`Name (e.g. ${label})`}
                          className="text-sm"
                        />
                      </div>
                    )
                  })}
                </div>
              </Section>

              {/* Pages */}
              <Section title="Pages" emoji="📄">
                <div className="space-y-3">
                  <p className="text-[11px] text-muted-foreground">Each filled section becomes a public page linked from the footer (/about, /terms, /refund, /privacy). Leave empty to hide.</p>
                  <div className="space-y-1">
                    <Label htmlFor="footer_about_us" className="text-xs">About Us</Label>
                    <Textarea id="footer_about_us" value={draft.footer_about_us || ''} onChange={(e) => updateDraft('footer_about_us', e.target.value)} placeholder="Tell customers about your business..." rows={4} className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="footer_terms_of_service" className="text-xs">Terms of Service</Label>
                    <Textarea id="footer_terms_of_service" value={draft.footer_terms_of_service || ''} onChange={(e) => updateDraft('footer_terms_of_service', e.target.value)} placeholder="Your terms of service..." rows={4} className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="footer_refund_policy" className="text-xs">Refund / Cancellation Policy</Label>
                    <Textarea id="footer_refund_policy" value={draft.footer_refund_policy || ''} onChange={(e) => updateDraft('footer_refund_policy', e.target.value)} placeholder="Your refund and cancellation policy..." rows={4} className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="footer_privacy_policy" className="text-xs">Privacy Policy</Label>
                    <Textarea id="footer_privacy_policy" value={draft.footer_privacy_policy || ''} onChange={(e) => updateDraft('footer_privacy_policy', e.target.value)} placeholder="Your privacy policy..." rows={4} className="text-sm" />
                  </div>
                </div>
              </Section>

              {/* Bottom row */}
              <Section title="Bottom Row" emoji="©️">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="footer_copyright_text" className="text-xs">Copyright Text</Label>
                    <Input id="footer_copyright_text" value={draft.footer_copyright_text || ''} onChange={(e) => updateDraft('footer_copyright_text', e.target.value)} placeholder="© 2026 Your Business. All rights reserved." className="text-sm" />
                    <p className="text-[11px] text-muted-foreground">Leave empty to auto-generate from business name and year.</p>
                  </div>
                  <label className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2">
                    <span className="text-xs font-medium">Show &quot;Powered by&quot;</span>
                    <input
                      type="checkbox"
                      checked={draft.footer_show_powered_by !== false}
                      onChange={(e) => updateDraft('footer_show_powered_by', e.target.checked)}
                      className="h-4 w-4"
                    />
                  </label>
                  <div className="space-y-1">
                    <Label htmlFor="footer_powered_by_text" className="text-xs">Powered-by Text</Label>
                    <Input id="footer_powered_by_text" value={draft.footer_powered_by_text || ''} onChange={(e) => updateDraft('footer_powered_by_text', e.target.value)} placeholder="Powered by WebNegosyo" className="text-sm" />
                  </div>
                </div>
              </Section>

              {/* Colors */}
              <Section title="Footer Colors" emoji="🎨">
                <p className="text-[11px] text-muted-foreground mb-2">Leave a color untouched to inherit it from the selected theme.</p>
                <div className="grid gap-3 grid-cols-2">
                  <Swatch id="footer_background_color" label="Background" value={draft.footer_background_color || ''} onChange={(v) => updateDraft('footer_background_color', v)} compact />
                  <Swatch id="footer_text_color" label="Text" value={draft.footer_text_color || ''} onChange={(v) => updateDraft('footer_text_color', v)} compact />
                  <Swatch id="footer_heading_color" label="Heading" value={draft.footer_heading_color || ''} onChange={(v) => updateDraft('footer_heading_color', v)} compact />
                  <Swatch id="footer_link_color" label="Link" value={draft.footer_link_color || ''} onChange={(v) => updateDraft('footer_link_color', v)} compact />
                  <Swatch id="footer_muted_color" label="Muted" value={draft.footer_muted_color || ''} onChange={(v) => updateDraft('footer_muted_color', v)} compact />
                  <Swatch id="footer_icon_color" label="Icon Glyph" value={draft.footer_icon_color || ''} onChange={(v) => updateDraft('footer_icon_color', v)} compact />
                  <Swatch id="footer_icon_background_color" label="Icon Background" value={draft.footer_icon_background_color || ''} onChange={(v) => updateDraft('footer_icon_background_color', v)} compact />
                  <Swatch id="footer_border_color" label="Border" value={draft.footer_border_color || ''} onChange={(v) => updateDraft('footer_border_color', v)} compact />
                </div>
              </Section>

              {/* Live preview */}
              <Section title="Live Preview" emoji="👀">
                <div className="overflow-hidden rounded-lg border">
                  <FooterView config={getFooterConfig({ ...(tenant as unknown as Record<string, unknown>), ...draft })} interactive={false} />
                </div>
              </Section>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </>
  )
}

function ScreenToggle({ value, onChange }: { value: 'desktop' | 'mobile'; onChange: (v: 'desktop' | 'mobile') => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-gray-50 p-1">
      <button
        type="button"
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
          value === 'desktop' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
        }`}
        onClick={() => onChange('desktop')}
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        Desktop
      </button>
      <button
        type="button"
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
          value === 'mobile' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
        }`}
        onClick={() => onChange('mobile')}
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        Mobile
      </button>
    </div>
  )
}

function Section({ title, emoji, children }: { title: string; emoji: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b">
        <span className="text-base">{emoji}</span>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function Swatch({
  id,
  label,
  value,
  onChange,
  compact = false
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  compact?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-gray-700">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          name={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type="color"
          className="h-9 w-11 p-0.5 border rounded-md cursor-pointer"
        />
        {!compact && (
          <Input
            value={value}
            readOnly
            className="font-mono text-xs bg-muted/50"
          />
        )}
      </div>
    </div>
  )
}
