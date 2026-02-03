'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveBrandingAction } from '@/app/actions/branding'
import type { Tenant, PromotionBanner } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CARD_TEMPLATES } from '@/lib/card-templates'
import { PAGE_LAYOUTS } from '@/lib/page-layouts'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SimpleImageUpload } from '@/components/shared/simple-image-upload'

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
  button_primary_color?: string
  button_primary_text_color?: string
  text_primary_color?: string
  text_secondary_color?: string
  border_color?: string
  // Hero customization
  hero_title?: string
  hero_description?: string
  hero_title_color?: string
  hero_description_color?: string
  card_template?: string
  page_layout?: string
  mobile_grid_columns?: number
  // Banners
  announcement_text?: string
  announcement_bg_color?: string
  announcement_text_color?: string
  is_announcement_visible?: boolean
  promotion_image_url?: string
  is_promotion_visible?: boolean
  promotion_banners?: PromotionBanner[]
}

interface BrandingEditorOverlayProps {
  tenant: Tenant
  onPreview: (draft: Partial<BrandingDraft> | null) => void
  onSaved?: () => void
}

export function BrandingEditorOverlay({ tenant, onPreview, onSaved }: BrandingEditorOverlayProps) {
  const supabase = useMemo(() => createClient(), [])
  const [isAllowed, setIsAllowed] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [isSaving, startSaving] = useTransition()
  const [draft, setDraft] = useState<BrandingDraft>({
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
    button_primary_color: tenant.button_primary_color || '',
    button_primary_text_color: tenant.button_primary_text_color || '',
    text_primary_color: tenant.text_primary_color || '',
    text_secondary_color: tenant.text_secondary_color || '',
    border_color: tenant.border_color || '',
    hero_title: tenant.hero_title || '',
    hero_description: tenant.hero_description || '',
    hero_title_color: tenant.hero_title_color || '',
    hero_description_color: tenant.hero_description_color || '',
    card_template: tenant.card_template || 'classic',
    page_layout: tenant.page_layout || 'default',
    mobile_grid_columns: tenant.mobile_grid_columns || 1,
    announcement_text: tenant.announcement_text || '',
    announcement_bg_color: tenant.announcement_bg_color || '#FFF4E5',
    announcement_text_color: tenant.announcement_text_color || '#663C00',
    is_announcement_visible: tenant.is_announcement_visible || false,
    promotion_image_url: tenant.promotion_image_url || '',
    is_promotion_visible: tenant.is_promotion_visible || false,
    promotion_banners: tenant.promotion_banners || [],
  })

  // Check role client-side (RLS still protects the update)
  useEffect(() => {
    let isCancelled = false
    async function checkRole() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: role } = await supabase
        .from('app_users')
        .select('role, tenant_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (isCancelled) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = role as any
      const allowed = !!r && (r.role === 'superadmin' || (r.role === 'admin' && r.tenant_id === tenant.id))
      setIsAllowed(allowed)
    }
    checkRole()
    return () => { isCancelled = true }
  }, [supabase, tenant.id])

  // Live preview hook
  useEffect(() => {
    if (isOpen) onPreview(draft)
    else onPreview(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, draft])

  if (!isAllowed) return null

  function updateDraft<K extends keyof BrandingDraft>(key: K, value: BrandingDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  function handleSave() {
    startSaving(async () => {
      const result = await saveBrandingAction(tenant.id, tenant.slug, draft)
      if (result.success) {
        setIsOpen(false)
        onSaved?.()
      } else {
        console.error('[BrandingEditor] Save failed:', result.error)
      }
    })
  }

  return (
    <>
      {/* Floating square toggle */}
      <button
        type="button"
        aria-label="Edit branding"
        className="fixed right-4 bottom-6 z-[60] h-12 w-12 rounded-lg border bg-white shadow-lg flex items-center justify-center hover:bg-gray-50"
        onClick={() => setIsOpen((v) => !v)}
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
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>Close</Button>
              <Button size="sm" disabled={isSaving} onClick={handleSave}>
                {isSaving ? 'Saving…' : '💾 Save'}
              </Button>
            </div>
          </div>

          {/* Tabs for Colors and Card Templates */}
          <Tabs defaultValue="colors" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="mx-4 mt-4">
              <TabsTrigger value="colors" className="flex-1">
                <span className="mr-1.5">🎨</span>
                Colors
              </TabsTrigger>
              <TabsTrigger value="layouts" className="flex-1">
                <span className="mr-1.5">📐</span>
                Layouts
              </TabsTrigger>
              <TabsTrigger value="cards" className="flex-1">
                <span className="mr-1.5">🃏</span>
                Cards
              </TabsTrigger>
              <TabsTrigger value="banners" className="flex-1">
                <span className="mr-1.5">📢</span>
                Banners
              </TabsTrigger>
            </TabsList>

            {/* Colors Tab */}
            <TabsContent value="colors" className="flex-1 overflow-y-auto p-4 space-y-6 mt-0">
              {/* Hero Section */}
              <Section title="Hero Section" emoji="🏠">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="hero_title" className="text-xs">Hero Title</Label>
                    <Input id="hero_title" name="hero_title" value={draft.hero_title || ''} onChange={(e) => updateDraft('hero_title', e.target.value)} placeholder="Our Menu" className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="hero_description" className="text-xs">Hero Description</Label>
                    <Input id="hero_description" name="hero_description" value={draft.hero_description || ''} onChange={(e) => updateDraft('hero_description', e.target.value)} placeholder="Your Smart Ordering Partner" className="text-sm" />
                  </div>
                  <div className="grid gap-3 grid-cols-2">
                    <Swatch id="hero_title_color" label="Title Color" value={draft.hero_title_color || ''} onChange={(v) => updateDraft('hero_title_color', v)} compact />
                    <Swatch id="hero_description_color" label="Description Color" value={draft.hero_description_color || ''} onChange={(v) => updateDraft('hero_description_color', v)} compact />
                  </div>
                </div>
              </Section>

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

              {/* Menu Cards */}
              <Section title="Menu Cards" emoji="🃏">
                <div className="grid gap-3 grid-cols-2">
                  <Swatch id="cards_color" label="Card Background" value={draft.cards_color || ''} onChange={(v) => updateDraft('cards_color', v)} compact />
                  <Swatch id="cards_border_color" label="Card Border" value={draft.cards_border_color || ''} onChange={(v) => updateDraft('cards_border_color', v)} compact />
                  <Swatch id="card_title_color" label="Title" value={draft.card_title_color || ''} onChange={(v) => updateDraft('card_title_color', v)} compact />
                  <Swatch id="card_price_color" label="Price" value={draft.card_price_color || ''} onChange={(v) => updateDraft('card_price_color', v)} compact />
                  <Swatch id="card_description_color" label="Description" value={draft.card_description_color || ''} onChange={(v) => updateDraft('card_description_color', v)} compact />
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

              {/* Buttons */}
              <Section title="Buttons" emoji="🔘">
                <div className="grid gap-3 grid-cols-2">
                  <Swatch id="button_primary_color" label="Primary" value={draft.button_primary_color || ''} onChange={(v) => updateDraft('button_primary_color', v)} compact />
                  <Swatch id="button_primary_text_color" label="Primary Text" value={draft.button_primary_text_color || ''} onChange={(v) => updateDraft('button_primary_text_color', v)} compact />
                </div>
              </Section>

              {/* Text Colors */}
              <Section title="Text Colors" emoji="📝">
                <div className="grid gap-3 grid-cols-2">
                  <Swatch id="text_primary_color" label="Primary" value={draft.text_primary_color || ''} onChange={(v) => updateDraft('text_primary_color', v)} compact />
                  <Swatch id="text_secondary_color" label="Secondary" value={draft.text_secondary_color || ''} onChange={(v) => updateDraft('text_secondary_color', v)} compact />
                </div>
              </Section>
            </TabsContent>

            {/* Layouts Tab */}
            <TabsContent value="layouts" className="flex-1 overflow-y-auto p-4 mt-0">
              <div className="space-y-4">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-900">Choose Your Page Layout</h3>
                  <p className="text-xs text-muted-foreground">
                    Select how your menu page is structured. This controls the navigation and grid arrangement.
                  </p>
                </div>

                <div className="grid gap-4">
                  {PAGE_LAYOUTS.map((layout) => (
                    <button
                      key={layout.id}
                      type="button"
                      className="relative text-left rounded-xl border-2 p-4 transition-all hover:shadow-md"
                      style={{
                        borderColor: draft.page_layout === layout.id ? draft.primary_color : '#e5e7eb',
                        backgroundColor: draft.page_layout === layout.id ? `${draft.primary_color}10` : '#ffffff'
                      }}
                      onClick={() => updateDraft('page_layout', layout.id)}
                    >
                      {draft.page_layout === layout.id && (
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
                                  backgroundColor: draft.page_layout === layout.id
                                    ? draft.primary_color
                                    : '#f3f4f6',
                                  color: draft.page_layout === layout.id
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
                  ))}
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
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-900">Choose Your Card Design</h3>
                  <p className="text-xs text-muted-foreground">
                    Select a card template that best represents your brand. All templates use your custom colors.
                  </p>
                </div>

                <div className="grid gap-4">
                  {CARD_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className="relative text-left rounded-xl border-2 p-4 transition-all hover:shadow-md"
                      style={{
                        borderColor: draft.card_template === template.id ? draft.primary_color : '#e5e7eb',
                        backgroundColor: draft.card_template === template.id ? `${draft.primary_color}10` : '#ffffff'
                      }}
                      onClick={() => updateDraft('card_template', template.id)}
                    >
                      {draft.card_template === template.id && (
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
                                  backgroundColor: draft.card_template === template.id
                                    ? draft.primary_color
                                    : '#f3f4f6',
                                  color: draft.card_template === template.id
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
                  ))}
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
          </Tabs>
        </div>
      )}
    </>
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


