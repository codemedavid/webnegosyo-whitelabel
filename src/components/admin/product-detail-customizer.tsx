'use client'

import { useEffect, useMemo, useState, useTransition, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Tenant } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CustomizeSection } from '@/components/admin/customize-section'
import { ColorPickerField } from '@/components/admin/color-picker-field'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { saveProductDetailSettings, resetProductDetailSettings } from '@/app/actions/product-detail-settings'
import type { ProductDetailSettings } from '@/lib/product-detail-theme'
import { DEFAULT_PRODUCT_DETAIL_SETTINGS } from '@/lib/product-detail-theme'
import { X } from 'lucide-react'

interface ProductDetailCustomizerProps {
    tenant: Tenant
    onPreview: (draft: Partial<ProductDetailSettings> | null) => void
    onSaved?: () => void
}

export function ProductDetailCustomizer({ tenant, onPreview, onSaved }: ProductDetailCustomizerProps) {
    const supabase = useMemo(() => createClient(), [])
    const [isAllowed, setIsAllowed] = useState(false)
    const [isOpen, setIsOpen] = useState(false)
    const [isSaving, startSaving] = useTransition()
    const [isLoading, setIsLoading] = useState(false)
    const [draft, setDraft] = useState<Partial<ProductDetailSettings>>({})
    const [currentSettings, setCurrentSettings] = useState<Partial<ProductDetailSettings>>({})

    const defaults = DEFAULT_PRODUCT_DETAIL_SETTINGS

    // Check user permissions
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
            const r = role as { role: string; tenant_id: string } | null
            const allowed = !!r && (r.role === 'superadmin' || (r.role === 'admin' && r.tenant_id === tenant.id))
            setIsAllowed(allowed)
        }
        checkRole()
        return () => { isCancelled = true }
    }, [supabase, tenant.id])

    // Fetch current settings when sidebar opens
    useEffect(() => {
        if (!isOpen) {
            onPreview(null)
            return
        }

        let isCancelled = false
        
        async function loadCurrentSettings() {
            setIsLoading(true)
            try {
                const { getProductDetailSettings } = await import('@/app/actions/product-detail-settings')
                const result = await getProductDetailSettings(tenant.id)
                
                if (isCancelled) return
                
                if (result.success && result.data) {
                    // Populate both current settings and draft with saved values
                    setCurrentSettings(result.data)
                    setDraft(result.data)
                    // Apply preview immediately
                    onPreview(result.data)
                } else {
                    // No saved settings - use empty draft (will fall back to defaults in preview)
                    setCurrentSettings({})
                    setDraft({})
                }
            } catch (error) {
                console.error('Failed to load settings:', error)
                toast.error('Failed to load current settings')
            } finally {
                if (!isCancelled) {
                    setIsLoading(false)
                }
            }
        }

        loadCurrentSettings()
        
        return () => { isCancelled = true }
    }, [isOpen, tenant.id, onPreview])

    // Update preview when draft changes
    useEffect(() => {
        if (isOpen) {
            onPreview(draft)
        }
    }, [draft, isOpen, onPreview])

    const updateDraft = useCallback(<K extends keyof ProductDetailSettings>(key: K, value: ProductDetailSettings[K]) => {
        setDraft((d) => ({ ...d, [key]: value }))
    }, [])

    const handleSave = useCallback(() => {
        startSaving(async () => {
            const result = await saveProductDetailSettings(tenant.id, tenant.slug, draft)
            if (result.success) {
                setCurrentSettings(draft)
                toast.success('Product detail settings saved successfully')
                onSaved?.()
            } else {
                toast.error(result.error || 'Failed to save product detail settings')
            }
        })
    }, [draft, tenant.id, tenant.slug, onSaved])

    const handleReset = useCallback(() => {
        startSaving(async () => {
            const result = await resetProductDetailSettings(tenant.id, tenant.slug)
            if (result.success) {
                setDraft({})
                setCurrentSettings({})
                onPreview({})
                toast.success('Product detail settings reset to defaults')
                onSaved?.()
            } else {
                toast.error(result.error || 'Failed to reset product detail settings')
            }
        })
    }, [tenant.id, tenant.slug, onPreview, onSaved])

    // Helper to get current value (draft > current settings > defaults)
    const getValue = useCallback(<K extends keyof ProductDetailSettings>(
        key: K,
        defaultValue: NonNullable<ProductDetailSettings[K]>
    ): NonNullable<ProductDetailSettings[K]> => {
        return (draft[key] ?? currentSettings[key] ?? defaultValue) as NonNullable<ProductDetailSettings[K]>
    }, [draft, currentSettings])

    if (!isAllowed) return null

    return (
        <>
            {/* Floating Action Button */}
            <button
                type="button"
                aria-label="Customize product detail page"
                className="fixed right-4 bottom-6 z-[60] h-12 w-12 rounded-lg border bg-white shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors"
                onClick={() => setIsOpen((v) => !v)}
                title="Customize product detail page"
            >
                <span className="text-xl">🎨</span>
            </button>

            {/* Non-modal Sidebar - allows background interaction */}
            {isOpen && (
                <>
                    {/* Semi-transparent backdrop - click to close but doesn't block scroll */}
                    <div 
                        className="fixed inset-0 bg-black/20 z-[55]"
                        onClick={() => setIsOpen(false)}
                    />
                    
                    {/* Sidebar Panel */}
                    <div className="fixed right-0 top-0 h-full w-full sm:w-[500px] bg-white shadow-2xl z-[56] overflow-hidden flex flex-col">
                        {/* Header */}
                        <div className="px-6 py-4 border-b flex items-center justify-between bg-white">
                            <div className="flex items-center gap-2">
                                <span className="text-xl">🎨</span>
                                <div>
                                    <div className="font-semibold">Product Detail Editor</div>
                                    <div className="text-xs text-muted-foreground">Customize the look and feel</div>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                                aria-label="Close"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                            {isLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
                                </div>
                            ) : (
                                <>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            onClick={handleReset}
                                            className="flex-1"
                                            disabled={isSaving}
                                        >
                                            Reset All
                                        </Button>
                                        <Button
                                            onClick={handleSave}
                                            className="flex-1"
                                            disabled={isSaving}
                                        >
                                            {isSaving ? 'Saving…' : 'Save Changes'}
                                        </Button>
                                    </div>

                                    <Tabs defaultValue="colors" className="w-full">
                                        <TabsList className="grid w-full grid-cols-3">
                                            <TabsTrigger value="colors">Colors</TabsTrigger>
                                            <TabsTrigger value="typography">Typography</TabsTrigger>
                                            <TabsTrigger value="layout">Layout</TabsTrigger>
                                        </TabsList>

                                        <TabsContent value="colors" className="space-y-6 mt-6">
                                            <CustomizeSection title="Page Background" emoji="📄">
                                                <div className="space-y-3">
                                                    <ColorPickerField
                                                        id="page_background_color"
                                                        label="Background Color"
                                                        value={getValue('page_background_color', defaults.page_background_color ?? '#ffffff')}
                                                        onChange={(v) => updateDraft('page_background_color', v)}
                                                        defaultValue={defaults.page_background_color}
                                                        compact
                                                    />
                                                    <div className="space-y-1">
                                                        <Label className="text-xs">Background Gradient (optional)</Label>
                                                        <Input
                                                            value={getValue('page_background_gradient', '')}
                                                            onChange={(e) => updateDraft('page_background_gradient', e.target.value)}
                                                            placeholder="linear-gradient(90deg, #fff, #f0f0f0)"
                                                            className="text-sm"
                                                        />
                                                    </div>
                                                </div>
                                            </CustomizeSection>

                                            <CustomizeSection title="Header & Navigation" emoji="📍">
                                                <div className="grid grid-cols-2 gap-3">
                                                    <ColorPickerField
                                                        id="header_button_background_color"
                                                        label="Button Background"
                                                        value={getValue('header_button_background_color', '#ffffff')}
                                                        onChange={(v) => updateDraft('header_button_background_color', v)}
                                                        defaultValue="#ffffff"
                                                        compact
                                                    />
                                                    <ColorPickerField
                                                        id="header_button_icon_color"
                                                        label="Button Icon Color"
                                                        value={getValue('header_button_icon_color', '#374151')}
                                                        onChange={(v) => updateDraft('header_button_icon_color', v)}
                                                        defaultValue="#374151"
                                                        compact
                                                    />
                                                </div>
                                            </CustomizeSection>

                                            <CustomizeSection title="Product Image" emoji="🖼️">
                                                <div className="grid grid-cols-2 gap-3">
                                                    <ColorPickerField
                                                        id="image_background_color"
                                                        label="Image Background"
                                                        value={getValue('image_background_color', defaults.image_background_color ?? '#f3f4f6')}
                                                        onChange={(v) => updateDraft('image_background_color', v)}
                                                        defaultValue={defaults.image_background_color ?? '#f3f4f6'}
                                                        compact
                                                    />
                                                    <ColorPickerField
                                                        id="sale_badge_background_color"
                                                        label="Sale Badge"
                                                        value={getValue('sale_badge_background_color', defaults.sale_badge_background_color ?? '#ef4444')}
                                                        onChange={(v) => updateDraft('sale_badge_background_color', v)}
                                                        defaultValue={defaults.sale_badge_background_color ?? '#ef4444'}
                                                        compact
                                                    />
                                                    <ColorPickerField
                                                        id="sale_badge_text_color"
                                                        label="Sale Badge Text"
                                                        value={getValue('sale_badge_text_color', defaults.sale_badge_text_color ?? '#ffffff')}
                                                        onChange={(v) => updateDraft('sale_badge_text_color', v)}
                                                        defaultValue={defaults.sale_badge_text_color ?? '#ffffff'}
                                                        compact
                                                    />
                                                </div>
                                            </CustomizeSection>

                                            <CustomizeSection title="Product Info" emoji="ℹ️">
                                                <div className="space-y-3">
                                                    <ColorPickerField
                                                        id="product_name_color"
                                                        label="Product Name"
                                                        value={getValue('product_name_color', defaults.product_name_color ?? '#111827')}
                                                        onChange={(v) => updateDraft('product_name_color', v)}
                                                        defaultValue={defaults.product_name_color ?? '#111827'}
                                                        compact
                                                    />
                                                    <ColorPickerField
                                                        id="description_color"
                                                        label="Description"
                                                        value={getValue('description_color', defaults.description_color ?? '#6b7280')}
                                                        onChange={(v) => updateDraft('description_color', v)}
                                                        defaultValue={defaults.description_color ?? '#6b7280'}
                                                        compact
                                                    />
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <ColorPickerField
                                                            id="breadcrumb_color"
                                                            label="Breadcrumb"
                                                            value={getValue('breadcrumb_color', '')}
                                                            onChange={(v) => updateDraft('breadcrumb_color', v)}
                                                            compact
                                                        />
                                                        <ColorPickerField
                                                            id="breadcrumb_active_color"
                                                            label="Breadcrumb Active"
                                                            value={getValue('breadcrumb_active_color', '')}
                                                            onChange={(v) => updateDraft('breadcrumb_active_color', v)}
                                                            compact
                                                        />
                                                    </div>
                                                </div>
                                            </CustomizeSection>

                                            <CustomizeSection title="Variations" emoji="🔄">
                                                <div className="space-y-3">
                                                    <ColorPickerField
                                                        id="variation_section_title_color"
                                                        label="Section Title"
                                                        value={getValue('variation_section_title_color', defaults.variation_section_title_color ?? '#111827')}
                                                        onChange={(v) => updateDraft('variation_section_title_color', v)}
                                                        defaultValue={defaults.variation_section_title_color ?? '#111827'}
                                                        compact
                                                    />
                                                    <ColorPickerField
                                                        id="variation_option_background_color"
                                                        label="Option Background"
                                                        value={getValue('variation_option_background_color', defaults.variation_option_background_color ?? '#f9fafb')}
                                                        onChange={(v) => updateDraft('variation_option_background_color', v)}
                                                        defaultValue={defaults.variation_option_background_color ?? '#f9fafb'}
                                                        compact
                                                    />
                                                    <ColorPickerField
                                                        id="variation_option_selected_background_color"
                                                        label="Selected Background"
                                                        value={getValue('variation_option_selected_background_color', '')}
                                                        onChange={(v) => updateDraft('variation_option_selected_background_color', v)}
                                                        compact
                                                    />
                                                    <ColorPickerField
                                                        id="variation_price_modifier_color"
                                                        label="Price Modifier"
                                                        value={getValue('variation_price_modifier_color', defaults.variation_price_modifier_color ?? '#6b7280')}
                                                        onChange={(v) => updateDraft('variation_price_modifier_color', v)}
                                                        defaultValue={defaults.variation_price_modifier_color ?? '#6b7280'}
                                                        compact
                                                    />
                                                </div>
                                            </CustomizeSection>

                                            <CustomizeSection title="Add-ons" emoji="➕">
                                                <div className="space-y-3">
                                                    <ColorPickerField
                                                        id="addon_section_title_color"
                                                        label="Section Title"
                                                        value={getValue('addon_section_title_color', defaults.addon_section_title_color ?? '#111827')}
                                                        onChange={(v) => updateDraft('addon_section_title_color', v)}
                                                        defaultValue={defaults.addon_section_title_color ?? '#111827'}
                                                        compact
                                                    />
                                                    <ColorPickerField
                                                        id="addon_background_color"
                                                        label="Background"
                                                        value={getValue('addon_background_color', defaults.addon_background_color ?? '#ffffff')}
                                                        onChange={(v) => updateDraft('addon_background_color', v)}
                                                        defaultValue={defaults.addon_background_color ?? '#ffffff'}
                                                        compact
                                                    />
                                                    <ColorPickerField
                                                        id="addon_selected_background_color"
                                                        label="Selected Background"
                                                        value={getValue('addon_selected_background_color', '')}
                                                        onChange={(v) => updateDraft('addon_selected_background_color', v)}
                                                        compact
                                                    />
                                                    <ColorPickerField
                                                        id="addon_price_color"
                                                        label="Price Text"
                                                        value={getValue('addon_price_color', defaults.addon_price_color ?? '#6b7280')}
                                                        onChange={(v) => updateDraft('addon_price_color', v)}
                                                        defaultValue={defaults.addon_price_color ?? '#6b7280'}
                                                        compact
                                                    />
                                                </div>
                                            </CustomizeSection>

                                            <CustomizeSection title="Cart Footer" emoji="🛒">
                                                <div className="space-y-3">
                                                    <ColorPickerField
                                                        id="footer_background_color"
                                                        label="Footer Background"
                                                        value={getValue('footer_background_color', defaults.footer_background_color ?? '#ffffff')}
                                                        onChange={(v) => updateDraft('footer_background_color', v)}
                                                        defaultValue={defaults.footer_background_color ?? '#ffffff'}
                                                        compact
                                                    />
                                                    <ColorPickerField
                                                        id="buy_now_button_background"
                                                        label="Buy Now Button"
                                                        value={getValue('buy_now_button_background', '')}
                                                        onChange={(v) => updateDraft('buy_now_button_background', v)}
                                                        compact
                                                    />
                                                    <ColorPickerField
                                                        id="add_to_cart_button_background"
                                                        label="Add to Cart Button"
                                                        value={getValue('add_to_cart_button_background', '')}
                                                        onChange={(v) => updateDraft('add_to_cart_button_background', v)}
                                                        compact
                                                    />
                                                    <ColorPickerField
                                                        id="total_price_color"
                                                        label="Total Price"
                                                        value={getValue('total_price_color', defaults.total_price_color ?? '#111827')}
                                                        onChange={(v) => updateDraft('total_price_color', v)}
                                                        defaultValue={defaults.total_price_color ?? '#111827'}
                                                        compact
                                                    />
                                                </div>
                                            </CustomizeSection>
                                        </TabsContent>

                                        <TabsContent value="typography" className="space-y-6 mt-6">
                                            <CustomizeSection title="Font Family" emoji="📝">
                                                <div className="space-y-3">
                                                    <div className="space-y-1">
                                                        <Label className="text-xs">Heading Font</Label>
                                                        <Input
                                                            value={getValue('font_family_heading', 'system-ui, -apple-system, sans-serif')}
                                                            onChange={(e) => updateDraft('font_family_heading', e.target.value)}
                                                            placeholder="system-ui, -apple-system, sans-serif"
                                                            className="text-sm"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-xs">Body Font</Label>
                                                        <Input
                                                            value={getValue('font_family_body', 'system-ui, -apple-system, sans-serif')}
                                                            onChange={(e) => updateDraft('font_family_body', e.target.value)}
                                                            placeholder="system-ui, -apple-system, sans-serif"
                                                            className="text-sm"
                                                        />
                                                    </div>
                                                </div>
                                            </CustomizeSection>

                                            <CustomizeSection title="Product Name" emoji="🏷️">
                                                <div className="space-y-3">
                                                    <div className="space-y-1">
                                                        <Label className="text-xs">Font Size</Label>
                                                        <Input
                                                            value={getValue('product_name_font_size', defaults.product_name_font_size ?? '24px')}
                                                            onChange={(e) => updateDraft('product_name_font_size', e.target.value)}
                                                            placeholder="24px"
                                                            className="text-sm"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-xs">Font Weight</Label>
                                                        <Input
                                                            value={getValue('product_name_font_weight', defaults.product_name_font_weight ?? '700')}
                                                            onChange={(e) => updateDraft('product_name_font_weight', e.target.value)}
                                                            placeholder="700"
                                                            className="text-sm"
                                                        />
                                                    </div>
                                                </div>
                                            </CustomizeSection>

                                            <CustomizeSection title="Description" emoji="📄">
                                                <div className="space-y-1">
                                                    <Label className="text-xs">Font Size</Label>
                                                    <Input
                                                        value={getValue('description_font_size', defaults.description_font_size ?? '14px')}
                                                        onChange={(e) => updateDraft('description_font_size', e.target.value)}
                                                        placeholder="14px"
                                                        className="text-sm"
                                                    />
                                                </div>
                                            </CustomizeSection>
                                        </TabsContent>

                                        <TabsContent value="layout" className="space-y-6 mt-6">
                                            <CustomizeSection title="Spacing" emoji="📐">
                                                <div className="space-y-3">
                                                    <div className="space-y-1">
                                                        <Label className="text-xs">Section Padding</Label>
                                                        <Input
                                                            value={getValue('section_padding', defaults.section_padding ?? '24px')}
                                                            onChange={(e) => updateDraft('section_padding', e.target.value)}
                                                            placeholder="24px"
                                                            className="text-sm"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-xs">Card Border Radius</Label>
                                                        <Input
                                                            value={getValue('card_border_radius', defaults.card_border_radius ?? '12px')}
                                                            onChange={(e) => updateDraft('card_border_radius', e.target.value)}
                                                            placeholder="12px"
                                                            className="text-sm"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-xs">Button Border Radius</Label>
                                                        <Input
                                                            value={getValue('button_border_radius', defaults.button_border_radius ?? '9999px')}
                                                            onChange={(e) => updateDraft('button_border_radius', e.target.value)}
                                                            placeholder="9999px"
                                                            className="text-sm"
                                                        />
                                                    </div>
                                                </div>
                                            </CustomizeSection>

                                            <CustomizeSection title="Animations" emoji="✨">
                                                <div className="space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <Label className="text-sm">Enable Animations</Label>
                                                        <Switch
                                                            checked={getValue('enable_animations', defaults.enable_animations ?? true)}
                                                            onCheckedChange={(v) => updateDraft('enable_animations', v)}
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-xs">Animation Speed</Label>
                                                        <select
                                                            value={getValue('animation_speed', defaults.animation_speed ?? 'normal')}
                                                            onChange={(e) => updateDraft('animation_speed', e.target.value as 'slow' | 'normal' | 'fast')}
                                                            className="w-full text-sm border rounded-md p-2"
                                                        >
                                                            <option value="slow">Slow</option>
                                                            <option value="normal">Normal</option>
                                                            <option value="fast">Fast</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </CustomizeSection>
                                        </TabsContent>
                                    </Tabs>
                                </>
                            )}
                        </div>
                    </div>
                </>
            )}
        </>
    )
}
