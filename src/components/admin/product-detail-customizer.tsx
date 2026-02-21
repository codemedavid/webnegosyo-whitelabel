'use client'

import { useEffect, useMemo, useState, useTransition, useCallback, useRef } from 'react'
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
    tenant: Pick<Tenant, 'id' | 'slug'>
    onPreview: (draft: Partial<ProductDetailSettings> | null) => void
    onSaved?: () => void
    onTogglePopupPreview?: () => void
    onToggleCheckoutPreview?: () => void
}

type CustomizerTab = 'colors' | 'typography' | 'layout'
type FocusedPane = 'palette' | 'settings'
type CustomizerSection = 'header' | 'image' | 'product_info' | 'variations' | 'addons' | 'footer_summary' | 'footer_buttons'

const PANEL_MARGIN = 12
const PANEL_DEFAULT_WIDTH = 820
const PANEL_DEFAULT_HEIGHT = 700
const PANEL_MIN_WIDTH = 560
const PANEL_MIN_HEIGHT = 520

interface ProductDetailCustomizerOpenDetail {
    tab?: CustomizerTab
    section?: CustomizerSection
    pane?: FocusedPane
}

export function ProductDetailCustomizer({ tenant, onPreview, onSaved, onTogglePopupPreview, onToggleCheckoutPreview }: ProductDetailCustomizerProps) {
    const supabase = useMemo(() => createClient(), [])
    const [isAllowed, setIsAllowed] = useState(false)
    const [isOpen, setIsOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<CustomizerTab>('colors')
    const [focusedSection, setFocusedSection] = useState<CustomizerSection | null>(null)
    const [focusedPane, setFocusedPane] = useState<FocusedPane>('palette')
    const [isSaving, startSaving] = useTransition()
    const [isLoading, setIsLoading] = useState(false)
    const [draft, setDraft] = useState<Partial<ProductDetailSettings>>({})
    const [currentSettings, setCurrentSettings] = useState<Partial<ProductDetailSettings>>({})
    const panelRef = useRef<HTMLDivElement>(null)
    const [panelPosition, setPanelPosition] = useState({ x: 24, y: 72 })
    const [panelSize, setPanelSize] = useState({ width: PANEL_DEFAULT_WIDTH, height: PANEL_DEFAULT_HEIGHT })
    const [isDragging, setIsDragging] = useState(false)
    const [isResizing, setIsResizing] = useState(false)
    const dragOffset = useRef({ x: 0, y: 0 })
    const resizeState = useRef({
        startX: 0,
        startY: 0,
        startWidth: PANEL_DEFAULT_WIDTH,
        startHeight: PANEL_DEFAULT_HEIGHT,
    })

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

    // Allow inline page pencil buttons to open/focus this editor.
    useEffect(() => {
        const handleOpenCustomizer = (event: Event) => {
            if (!isAllowed) return
            const detail = (event as CustomEvent<ProductDetailCustomizerOpenDetail>).detail
            if (detail?.tab) {
                setActiveTab(detail.tab)
            }
            if (detail?.section) {
                setFocusedSection(detail.section)
            } else {
                setFocusedSection(null)
            }
            if (detail?.pane) {
                setFocusedPane(detail.pane)
            } else if (detail?.section) {
                setFocusedPane('palette')
            }
            setIsOpen(true)
        }

        window.addEventListener('product-detail-customizer:open', handleOpenCustomizer as EventListener)
        return () => {
            window.removeEventListener('product-detail-customizer:open', handleOpenCustomizer as EventListener)
        }
    }, [isAllowed])

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
    // Fill null popup fields with the defaults shown in the color pickers so the
    // live preview matches what the user sees in the customizer panel.
    useEffect(() => {
        if (isOpen) {
            const previewDraft = { ...draft }
            if (previewDraft.popup_modal_background_color == null) {
                previewDraft.popup_modal_background_color = '#ffffff'
            }
            if (previewDraft.popup_modal_title_color == null) {
                previewDraft.popup_modal_title_color = '#111111'
            }
            if (previewDraft.popup_modal_description_color == null) {
                previewDraft.popup_modal_description_color = '#6b7280'
            }
            if (previewDraft.popup_modal_price_color == null) {
                previewDraft.popup_modal_price_color = '#111111'
            }
            if (previewDraft.popup_modal_button_color == null) {
                previewDraft.popup_modal_button_color = '#3b82f6'
            }
            if (previewDraft.popup_modal_button_text_color == null) {
                previewDraft.popup_modal_button_text_color = '#ffffff'
            }
            if (previewDraft.popup_modal_border_color == null) {
                previewDraft.popup_modal_border_color = '#e5e7eb'
            }
            if (previewDraft.checkout_modal_background_color == null) {
                previewDraft.checkout_modal_background_color = '#ffffff'
            }
            if (previewDraft.checkout_modal_title_color == null) {
                previewDraft.checkout_modal_title_color = '#111111'
            }
            if (previewDraft.checkout_modal_description_color == null) {
                previewDraft.checkout_modal_description_color = '#6b7280'
            }
            if (previewDraft.checkout_modal_price_color == null) {
                previewDraft.checkout_modal_price_color = '#111111'
            }
            if (previewDraft.checkout_modal_button_color == null) {
                previewDraft.checkout_modal_button_color = '#3b82f6'
            }
            if (previewDraft.checkout_modal_button_text_color == null) {
                previewDraft.checkout_modal_button_text_color = '#ffffff'
            }
            if (previewDraft.checkout_modal_border_color == null) {
                previewDraft.checkout_modal_border_color = '#e5e7eb'
            }
            onPreview(previewDraft)
        }
    }, [draft, isOpen, onPreview])

    const updateDraft = useCallback(<K extends keyof ProductDetailSettings>(key: K, value: ProductDetailSettings[K]) => {
        setDraft((d) => ({ ...d, [key]: value }))
    }, [])

    const handleSave = useCallback(() => {
        startSaving(async () => {
            // Fill null popup fields with defaults so they persist correctly
            const saveDraft = { ...draft }
            if (saveDraft.popup_modal_background_color == null) {
                saveDraft.popup_modal_background_color = '#ffffff'
            }
            if (saveDraft.popup_modal_title_color == null) {
                saveDraft.popup_modal_title_color = '#111111'
            }
            if (saveDraft.popup_modal_description_color == null) {
                saveDraft.popup_modal_description_color = '#6b7280'
            }
            if (saveDraft.popup_modal_price_color == null) {
                saveDraft.popup_modal_price_color = '#111111'
            }
            if (saveDraft.popup_modal_button_color == null) {
                saveDraft.popup_modal_button_color = '#3b82f6'
            }
            if (saveDraft.popup_modal_button_text_color == null) {
                saveDraft.popup_modal_button_text_color = '#ffffff'
            }
            if (saveDraft.popup_modal_border_color == null) {
                saveDraft.popup_modal_border_color = '#e5e7eb'
            }
            if (saveDraft.checkout_modal_background_color == null) {
                saveDraft.checkout_modal_background_color = '#ffffff'
            }
            if (saveDraft.checkout_modal_title_color == null) {
                saveDraft.checkout_modal_title_color = '#111111'
            }
            if (saveDraft.checkout_modal_description_color == null) {
                saveDraft.checkout_modal_description_color = '#6b7280'
            }
            if (saveDraft.checkout_modal_price_color == null) {
                saveDraft.checkout_modal_price_color = '#111111'
            }
            if (saveDraft.checkout_modal_button_color == null) {
                saveDraft.checkout_modal_button_color = '#3b82f6'
            }
            if (saveDraft.checkout_modal_button_text_color == null) {
                saveDraft.checkout_modal_button_text_color = '#ffffff'
            }
            if (saveDraft.checkout_modal_border_color == null) {
                saveDraft.checkout_modal_border_color = '#e5e7eb'
            }
            const result = await saveProductDetailSettings(tenant.id, tenant.slug, saveDraft)
            if (result.success) {
                setCurrentSettings(saveDraft)
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

    const focusedSectionTitle = useMemo(() => {
        if (!focusedSection) return null
        const labels: Record<CustomizerSection, string> = {
            header: 'Header & Navigation',
            image: 'Product Image',
            product_info: 'Product Info',
            variations: 'Variation Selector',
            addons: 'Add-ons',
            footer_summary: 'Footer Summary',
            footer_buttons: 'Footer Buttons',
        }
        return labels[focusedSection]
    }, [focusedSection])

    const clampPanelSize = useCallback((width: number, height: number, x = panelPosition.x, y = panelPosition.y) => {
        if (typeof window === 'undefined') return { width, height }
        const maxWidth = Math.max(360, window.innerWidth - x - PANEL_MARGIN)
        const maxHeight = Math.max(320, window.innerHeight - y - PANEL_MARGIN)
        const minWidth = Math.min(PANEL_MIN_WIDTH, maxWidth)
        const minHeight = Math.min(PANEL_MIN_HEIGHT, maxHeight)
        return {
            width: Math.min(Math.max(minWidth, width), maxWidth),
            height: Math.min(Math.max(minHeight, height), maxHeight),
        }
    }, [panelPosition.x, panelPosition.y])

    const clampPanelPosition = useCallback((x: number, y: number, width = panelSize.width, height = panelSize.height) => {
        if (typeof window === 'undefined') return { x, y }
        const maxX = Math.max(PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN)
        const maxY = Math.max(PANEL_MARGIN, window.innerHeight - height - PANEL_MARGIN)
        return {
            x: Math.min(Math.max(PANEL_MARGIN, x), maxX),
            y: Math.min(Math.max(PANEL_MARGIN, y), maxY),
        }
    }, [panelSize.height, panelSize.width])

    const centerPanel = useCallback(() => {
        if (typeof window === 'undefined') return
        const viewportMaxWidth = Math.max(360, window.innerWidth - (PANEL_MARGIN * 2))
        const viewportMaxHeight = Math.max(320, window.innerHeight - (PANEL_MARGIN * 2))
        const viewportMinWidth = Math.min(PANEL_MIN_WIDTH, viewportMaxWidth)
        const viewportMinHeight = Math.min(PANEL_MIN_HEIGHT, viewportMaxHeight)
        const nextSize = {
            width: Math.min(Math.max(viewportMinWidth, panelSize.width), viewportMaxWidth),
            height: Math.min(Math.max(viewportMinHeight, panelSize.height), viewportMaxHeight),
        }
        const centered = clampPanelPosition(
            (window.innerWidth - nextSize.width) / 2,
            (window.innerHeight - nextSize.height) / 2,
            nextSize.width,
            nextSize.height
        )
        setPanelSize(nextSize)
        setPanelPosition(centered)
    }, [clampPanelPosition, panelSize.height, panelSize.width])

    useEffect(() => {
        if (!isOpen) return
        const frame = window.requestAnimationFrame(centerPanel)
        return () => window.cancelAnimationFrame(frame)
    }, [isOpen, focusedSection, centerPanel])

    useEffect(() => {
        if (!isOpen) return
        const handleResize = () => {
            const nextSize = clampPanelSize(panelSize.width, panelSize.height, panelPosition.x, panelPosition.y)
            const nextPosition = clampPanelPosition(panelPosition.x, panelPosition.y, nextSize.width, nextSize.height)
            setPanelSize(nextSize)
            setPanelPosition(nextPosition)
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [isOpen, clampPanelPosition, clampPanelSize, panelPosition.x, panelPosition.y, panelSize.height, panelSize.width])

    const handleDragStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || isResizing) return
        const target = event.target as HTMLElement | null
        if (target?.closest('[data-editor-no-drag="true"]')) return
        event.currentTarget.setPointerCapture(event.pointerId)
        dragOffset.current = {
            x: event.clientX - panelPosition.x,
            y: event.clientY - panelPosition.y,
        }
        setIsDragging(true)
    }, [isResizing, panelPosition.x, panelPosition.y])

    const handleDragMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging) return
        const next = clampPanelPosition(
            event.clientX - dragOffset.current.x,
            event.clientY - dragOffset.current.y,
            panelSize.width,
            panelSize.height
        )
        setPanelPosition(next)
    }, [clampPanelPosition, isDragging, panelSize.height, panelSize.width])

    const handleDragEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
        }
        setIsDragging(false)
    }, [])

    const handleResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || isDragging) return
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        resizeState.current = {
            startX: event.clientX,
            startY: event.clientY,
            startWidth: panelSize.width,
            startHeight: panelSize.height,
        }
        setIsResizing(true)
    }, [isDragging, panelSize.height, panelSize.width])

    const handleResizeMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!isResizing) return
        event.preventDefault()
        const rawWidth = resizeState.current.startWidth + (event.clientX - resizeState.current.startX)
        const rawHeight = resizeState.current.startHeight + (event.clientY - resizeState.current.startY)
        const nextSize = clampPanelSize(rawWidth, rawHeight)
        setPanelSize(nextSize)
        setPanelPosition((current) => clampPanelPosition(current.x, current.y, nextSize.width, nextSize.height))
    }, [clampPanelPosition, clampPanelSize, isResizing])

    const handleResizeEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
        }
        setIsResizing(false)
    }, [])

    const renderFocusedPalette = () => {
        if (!focusedSection) return null

        switch (focusedSection) {
            case 'header':
                return (
                    <CustomizeSection title="Header & Navigation" emoji="📍">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                )
            case 'image':
                return (
                    <CustomizeSection title="Product Image" emoji="🖼️">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                )
            case 'product_info':
                return (
                    <CustomizeSection title="Product Info Colors" emoji="ℹ️">
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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                )
            case 'variations':
                return (
                    <CustomizeSection title="Variation Colors" emoji="🔄">
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
                                id="variation_required_badge_color"
                                label="Required/Optional Text"
                                value={getValue('variation_required_badge_color', defaults.variation_required_badge_color ?? '#6b7280')}
                                onChange={(v) => updateDraft('variation_required_badge_color', v)}
                                defaultValue={defaults.variation_required_badge_color ?? '#6b7280'}
                                compact
                            />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <ColorPickerField
                                    id="variation_option_background_color"
                                    label="Inactive Background"
                                    value={getValue('variation_option_background_color', defaults.variation_option_background_color ?? '#f9fafb')}
                                    onChange={(v) => updateDraft('variation_option_background_color', v)}
                                    defaultValue={defaults.variation_option_background_color ?? '#f9fafb'}
                                    compact
                                />
                                <ColorPickerField
                                    id="variation_option_text_color"
                                    label="Inactive Text"
                                    value={getValue('variation_option_text_color', defaults.variation_option_text_color ?? '#374151')}
                                    onChange={(v) => updateDraft('variation_option_text_color', v)}
                                    defaultValue={defaults.variation_option_text_color ?? '#374151'}
                                    compact
                                />
                                <ColorPickerField
                                    id="variation_option_border_color"
                                    label="Inactive Border"
                                    value={getValue('variation_option_border_color', defaults.variation_option_border_color ?? '#e5e7eb')}
                                    onChange={(v) => updateDraft('variation_option_border_color', v)}
                                    defaultValue={defaults.variation_option_border_color ?? '#e5e7eb'}
                                    compact
                                />
                                <ColorPickerField
                                    id="variation_option_selected_background_color"
                                    label="Active Background"
                                    value={getValue('variation_option_selected_background_color', '')}
                                    onChange={(v) => updateDraft('variation_option_selected_background_color', v)}
                                    compact
                                />
                                <ColorPickerField
                                    id="variation_option_selected_text_color"
                                    label="Active Text"
                                    value={getValue('variation_option_selected_text_color', defaults.variation_option_selected_text_color ?? '#ffffff')}
                                    onChange={(v) => updateDraft('variation_option_selected_text_color', v)}
                                    defaultValue={defaults.variation_option_selected_text_color ?? '#ffffff'}
                                    compact
                                />
                                <ColorPickerField
                                    id="variation_option_selected_border_color"
                                    label="Active Border"
                                    value={getValue('variation_option_selected_border_color', '')}
                                    onChange={(v) => updateDraft('variation_option_selected_border_color', v)}
                                    compact
                                />
                            </div>
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
                )
            case 'addons':
                return (
                    <CustomizeSection title="Add-on Colors" emoji="➕">
                        <div className="space-y-3">
                            <ColorPickerField
                                id="addon_section_title_color"
                                label="Section Title"
                                value={getValue('addon_section_title_color', defaults.addon_section_title_color ?? '#111827')}
                                onChange={(v) => updateDraft('addon_section_title_color', v)}
                                defaultValue={defaults.addon_section_title_color ?? '#111827'}
                                compact
                            />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <ColorPickerField
                                    id="addon_background_color"
                                    label="Inactive Background"
                                    value={getValue('addon_background_color', defaults.addon_background_color ?? '#ffffff')}
                                    onChange={(v) => updateDraft('addon_background_color', v)}
                                    defaultValue={defaults.addon_background_color ?? '#ffffff'}
                                    compact
                                />
                                <ColorPickerField
                                    id="addon_text_color"
                                    label="Inactive Text"
                                    value={getValue('addon_text_color', defaults.addon_text_color ?? '#111827')}
                                    onChange={(v) => updateDraft('addon_text_color', v)}
                                    defaultValue={defaults.addon_text_color ?? '#111827'}
                                    compact
                                />
                                <ColorPickerField
                                    id="addon_border_color"
                                    label="Inactive Border"
                                    value={getValue('addon_border_color', defaults.addon_border_color ?? '#e5e7eb')}
                                    onChange={(v) => updateDraft('addon_border_color', v)}
                                    defaultValue={defaults.addon_border_color ?? '#e5e7eb'}
                                    compact
                                />
                                <ColorPickerField
                                    id="addon_selected_background_color"
                                    label="Active Background"
                                    value={getValue('addon_selected_background_color', '')}
                                    onChange={(v) => updateDraft('addon_selected_background_color', v)}
                                    compact
                                />
                                <ColorPickerField
                                    id="addon_selected_text_color"
                                    label="Active Text"
                                    value={getValue('addon_selected_text_color', '')}
                                    onChange={(v) => updateDraft('addon_selected_text_color', v)}
                                    compact
                                />
                                <ColorPickerField
                                    id="addon_selected_border_color"
                                    label="Active Border"
                                    value={getValue('addon_selected_border_color', '')}
                                    onChange={(v) => updateDraft('addon_selected_border_color', v)}
                                    compact
                                />
                                <ColorPickerField
                                    id="addon_selected_check_color"
                                    label="Checkmark Background"
                                    value={getValue('addon_selected_check_color', '')}
                                    onChange={(v) => updateDraft('addon_selected_check_color', v)}
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
                        </div>
                    </CustomizeSection>
                )
            case 'footer_summary':
                return (
                    <CustomizeSection title="Footer Summary Colors" emoji="🛒">
                        <div className="space-y-3">
                            <ColorPickerField
                                id="footer_background_color"
                                label="Footer Background"
                                value={getValue('footer_background_color', defaults.footer_background_color ?? '#ffffff')}
                                onChange={(v) => updateDraft('footer_background_color', v)}
                                defaultValue={defaults.footer_background_color ?? '#ffffff'}
                                compact
                            />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <ColorPickerField
                                    id="footer_border_color"
                                    label="Footer Border"
                                    value={getValue('footer_border_color', defaults.footer_border_color ?? '#e5e7eb')}
                                    onChange={(v) => updateDraft('footer_border_color', v)}
                                    defaultValue={defaults.footer_border_color ?? '#e5e7eb'}
                                    compact
                                />
                                <ColorPickerField
                                    id="summary_text_color"
                                    label="Summary Text"
                                    value={getValue('summary_text_color', defaults.summary_text_color ?? '#6b7280')}
                                    onChange={(v) => updateDraft('summary_text_color', v)}
                                    defaultValue={defaults.summary_text_color ?? '#6b7280'}
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
                                <ColorPickerField
                                    id="original_price_color"
                                    label="Original Price"
                                    value={getValue('original_price_color', defaults.original_price_color ?? '#9ca3af')}
                                    onChange={(v) => updateDraft('original_price_color', v)}
                                    defaultValue={defaults.original_price_color ?? '#9ca3af'}
                                    compact
                                />
                                <ColorPickerField
                                    id="quantity_controls_background"
                                    label="Quantity Background"
                                    value={getValue('quantity_controls_background', defaults.quantity_controls_background ?? '#f3f4f6')}
                                    onChange={(v) => updateDraft('quantity_controls_background', v)}
                                    defaultValue={defaults.quantity_controls_background ?? '#f3f4f6'}
                                    compact
                                />
                                <ColorPickerField
                                    id="quantity_button_color"
                                    label="Quantity Icon"
                                    value={getValue('quantity_button_color', defaults.quantity_button_color ?? '#374151')}
                                    onChange={(v) => updateDraft('quantity_button_color', v)}
                                    defaultValue={defaults.quantity_button_color ?? '#374151'}
                                    compact
                                />
                                <ColorPickerField
                                    id="quantity_text_color"
                                    label="Quantity Text"
                                    value={getValue('quantity_text_color', defaults.quantity_text_color ?? '#111827')}
                                    onChange={(v) => updateDraft('quantity_text_color', v)}
                                    defaultValue={defaults.quantity_text_color ?? '#111827'}
                                    compact
                                />
                            </div>
                        </div>
                    </CustomizeSection>
                )
            case 'footer_buttons':
                return (
                    <CustomizeSection title="Footer Button Colors" emoji="🛒">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <ColorPickerField
                                id="buy_now_button_background"
                                label="Buy Now Background"
                                value={getValue('buy_now_button_background', '')}
                                onChange={(v) => updateDraft('buy_now_button_background', v)}
                                compact
                            />
                            <ColorPickerField
                                id="buy_now_button_text_color"
                                label="Buy Now Text"
                                value={getValue('buy_now_button_text_color', '')}
                                onChange={(v) => updateDraft('buy_now_button_text_color', v)}
                                compact
                            />
                            <ColorPickerField
                                id="buy_now_button_border_color"
                                label="Buy Now Border"
                                value={getValue('buy_now_button_border_color', '')}
                                onChange={(v) => updateDraft('buy_now_button_border_color', v)}
                                compact
                            />
                            <ColorPickerField
                                id="add_to_cart_button_background"
                                label="Add to Cart Background"
                                value={getValue('add_to_cart_button_background', '')}
                                onChange={(v) => updateDraft('add_to_cart_button_background', v)}
                                compact
                            />
                            <ColorPickerField
                                id="add_to_cart_button_text_color"
                                label="Add to Cart Text"
                                value={getValue('add_to_cart_button_text_color', defaults.add_to_cart_button_text_color ?? '#ffffff')}
                                onChange={(v) => updateDraft('add_to_cart_button_text_color', v)}
                                defaultValue={defaults.add_to_cart_button_text_color ?? '#ffffff'}
                                compact
                            />
                        </div>
                    </CustomizeSection>
                )
            default:
                return null
        }
    }

    const renderFocusedSettings = () => {
        if (!focusedSection) return null

        switch (focusedSection) {
            case 'product_info':
                return (
                    <CustomizeSection title="Product Info Settings" emoji="📝">
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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs">Name Font Size</Label>
                                    <Input
                                        value={getValue('product_name_font_size', defaults.product_name_font_size ?? '24px')}
                                        onChange={(e) => updateDraft('product_name_font_size', e.target.value)}
                                        placeholder="24px"
                                        className="text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Name Font Weight</Label>
                                    <Input
                                        value={getValue('product_name_font_weight', defaults.product_name_font_weight ?? '700')}
                                        onChange={(e) => updateDraft('product_name_font_weight', e.target.value)}
                                        placeholder="700"
                                        className="text-sm"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Description Font Size</Label>
                                <Input
                                    value={getValue('description_font_size', defaults.description_font_size ?? '14px')}
                                    onChange={(e) => updateDraft('description_font_size', e.target.value)}
                                    placeholder="14px"
                                    className="text-sm"
                                />
                            </div>
                        </div>
                    </CustomizeSection>
                )
            case 'variations':
                return (
                    <CustomizeSection title="Variation Settings" emoji="🔧">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label htmlFor="variation_required_text" className="text-xs">Required Label</Label>
                                <Input
                                    id="variation_required_text"
                                    value={getValue('variation_required_text', defaults.variation_required_text ?? '* Pick 1')}
                                    onChange={(e) => updateDraft('variation_required_text', e.target.value)}
                                    placeholder="* Pick 1"
                                    className="text-sm"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="variation_optional_text" className="text-xs">Optional Label</Label>
                                <Input
                                    id="variation_optional_text"
                                    value={getValue('variation_optional_text', defaults.variation_optional_text ?? 'Optional')}
                                    onChange={(e) => updateDraft('variation_optional_text', e.target.value)}
                                    placeholder="Optional"
                                    className="text-sm"
                                />
                            </div>
                        </div>
                    </CustomizeSection>
                )
            case 'addons':
                return (
                    <CustomizeSection title="Add-on Settings" emoji="🔧">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label htmlFor="addon_price_free_text" className="text-xs">Free Price Label</Label>
                                <Input
                                    id="addon_price_free_text"
                                    value={getValue('addon_price_free_text', defaults.addon_price_free_text ?? 'Free')}
                                    onChange={(e) => updateDraft('addon_price_free_text', e.target.value)}
                                    placeholder="Free"
                                    className="text-sm"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="addon_optional_text" className="text-xs">Optional Label</Label>
                                <Input
                                    id="addon_optional_text"
                                    value={getValue('addon_optional_text', defaults.addon_optional_text ?? '(Optional)')}
                                    onChange={(e) => updateDraft('addon_optional_text', e.target.value)}
                                    placeholder="(Optional)"
                                    className="text-sm"
                                />
                            </div>
                        </div>
                    </CustomizeSection>
                )
            case 'footer_summary':
                return (
                    <CustomizeSection title="Footer Summary Settings" emoji="🔧">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label htmlFor="footer_shadow_color" className="text-xs">Footer Shadow</Label>
                                <Input
                                    id="footer_shadow_color"
                                    value={getValue('footer_shadow_color', defaults.footer_shadow_color ?? 'rgba(0,0,0,0.1)')}
                                    onChange={(e) => updateDraft('footer_shadow_color', e.target.value)}
                                    placeholder="rgba(0,0,0,0.1)"
                                    className="text-sm"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="footer_empty_summary_text" className="text-xs">Empty Summary Text</Label>
                                <Input
                                    id="footer_empty_summary_text"
                                    value={getValue('footer_empty_summary_text', defaults.footer_empty_summary_text ?? 'Standard')}
                                    onChange={(e) => updateDraft('footer_empty_summary_text', e.target.value)}
                                    placeholder="Standard"
                                    className="text-sm"
                                />
                            </div>
                        </div>
                    </CustomizeSection>
                )
            case 'footer_buttons':
                return (
                    <CustomizeSection title="Footer Button Settings" emoji="🔧">
                        <div className="space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label htmlFor="add_to_cart_button_shadow_color" className="text-xs">Add to Cart Shadow</Label>
                                    <Input
                                        id="add_to_cart_button_shadow_color"
                                        value={getValue('add_to_cart_button_shadow_color', defaults.add_to_cart_button_shadow_color ?? 'rgba(0,0,0,0.1)')}
                                        onChange={(e) => updateDraft('add_to_cart_button_shadow_color', e.target.value)}
                                        placeholder="rgba(0,0,0,0.1)"
                                        className="text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="button_border_radius" className="text-xs">Button Border Radius</Label>
                                    <Input
                                        id="button_border_radius"
                                        value={getValue('button_border_radius', defaults.button_border_radius ?? '9999px')}
                                        onChange={(e) => updateDraft('button_border_radius', e.target.value)}
                                        placeholder="9999px"
                                        className="text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="buy_now_button_label" className="text-xs">Buy Now Label</Label>
                                    <Input
                                        id="buy_now_button_label"
                                        value={getValue('buy_now_button_label', defaults.buy_now_button_label ?? 'Buy Now')}
                                        onChange={(e) => updateDraft('buy_now_button_label', e.target.value)}
                                        placeholder="Buy Now"
                                        className="text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="add_to_cart_button_label" className="text-xs">Add to Cart Label</Label>
                                    <Input
                                        id="add_to_cart_button_label"
                                        value={getValue('add_to_cart_button_label', defaults.add_to_cart_button_label ?? 'Add To Cart')}
                                        onChange={(e) => updateDraft('add_to_cart_button_label', e.target.value)}
                                        placeholder="Add To Cart"
                                        className="text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    </CustomizeSection>
                )
            default:
                return (
                    <CustomizeSection title="Section Settings" emoji="🔧">
                        <p className="text-sm text-muted-foreground">This section currently has color palette controls only.</p>
                    </CustomizeSection>
                )
        }
    }

    if (!isAllowed) return null

    return (
        <>
            {/* Floating Action Button */}
            <button
                type="button"
                aria-label="Customize product detail page"
                className="fixed right-4 bottom-6 z-[60] h-12 w-12 rounded-lg border bg-white shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors"
                onClick={() => {
                    setFocusedSection(null)
                    setIsOpen((v) => !v)
                }}
                title="Customize product detail page"
            >
                <span className="text-xl">🎨</span>
            </button>

            {/* Movable editor window */}
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 bg-black/20 z-[55]"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Floating Panel */}
                    <div
                        ref={panelRef}
                        className="fixed z-[56] flex flex-col overflow-hidden rounded-xl border bg-white shadow-2xl"
                        style={{
                            left: `${panelPosition.x}px`,
                            top: `${panelPosition.y}px`,
                            width: `${panelSize.width}px`,
                            height: `${panelSize.height}px`,
                            maxWidth: `calc(100vw - ${PANEL_MARGIN * 2}px)`,
                            maxHeight: `calc(100vh - ${PANEL_MARGIN * 2}px)`,
                        }}
                    >
                        {/* Header */}
                        <div
                            className={`px-6 py-4 border-b flex items-start justify-between bg-white select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                            onPointerDown={handleDragStart}
                            onPointerMove={handleDragMove}
                            onPointerUp={handleDragEnd}
                            onPointerCancel={handleDragEnd}
                            style={{ touchAction: 'none' }}
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-xl shrink-0">🎨</span>
                                <div>
                                    <div className="font-semibold">
                                        {focusedSectionTitle ? `${focusedSectionTitle} Editor` : 'Product Detail Editor'}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {focusedSectionTitle
                                            ? 'Palette and settings for this section'
                                            : 'Customize the look and feel'}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1" data-editor-no-drag="true">
                                {focusedSection && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-xs"
                                        data-editor-no-drag="true"
                                        onClick={() => setFocusedSection(null)}
                                    >
                                        All Sections
                                    </Button>
                                )}
                                <button
                                    data-editor-no-drag="true"
                                    onClick={() => setIsOpen(false)}
                                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                                    aria-label="Close"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
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

                                    {focusedSection ? (
                                        <Tabs
                                            value={focusedPane}
                                            onValueChange={(value) => setFocusedPane(value as FocusedPane)}
                                            className="w-full"
                                        >
                                            <TabsList className="grid w-full grid-cols-2">
                                                <TabsTrigger value="palette">Palette</TabsTrigger>
                                                <TabsTrigger value="settings">Settings</TabsTrigger>
                                            </TabsList>

                                            <TabsContent value="palette" className="space-y-6 mt-6">
                                                {renderFocusedPalette()}
                                            </TabsContent>
                                            <TabsContent value="settings" className="space-y-6 mt-6">
                                                {renderFocusedSettings()}
                                            </TabsContent>
                                        </Tabs>
                                    ) : (
                                        <Tabs
                                            value={activeTab}
                                            onValueChange={(value) => setActiveTab(value as CustomizerTab)}
                                            className="w-full"
                                        >
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
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                                                        id="variation_required_badge_color"
                                                        label="Required/Optional Text"
                                                        value={getValue('variation_required_badge_color', defaults.variation_required_badge_color ?? '#6b7280')}
                                                        onChange={(v) => updateDraft('variation_required_badge_color', v)}
                                                        defaultValue={defaults.variation_required_badge_color ?? '#6b7280'}
                                                        compact
                                                    />
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <ColorPickerField
                                                            id="variation_option_background_color"
                                                            label="Inactive Background"
                                                            value={getValue('variation_option_background_color', defaults.variation_option_background_color ?? '#f9fafb')}
                                                            onChange={(v) => updateDraft('variation_option_background_color', v)}
                                                            defaultValue={defaults.variation_option_background_color ?? '#f9fafb'}
                                                            compact
                                                        />
                                                        <ColorPickerField
                                                            id="variation_option_text_color"
                                                            label="Inactive Text"
                                                            value={getValue('variation_option_text_color', defaults.variation_option_text_color ?? '#374151')}
                                                            onChange={(v) => updateDraft('variation_option_text_color', v)}
                                                            defaultValue={defaults.variation_option_text_color ?? '#374151'}
                                                            compact
                                                        />
                                                        <ColorPickerField
                                                            id="variation_option_border_color"
                                                            label="Inactive Border"
                                                            value={getValue('variation_option_border_color', defaults.variation_option_border_color ?? '#e5e7eb')}
                                                            onChange={(v) => updateDraft('variation_option_border_color', v)}
                                                            defaultValue={defaults.variation_option_border_color ?? '#e5e7eb'}
                                                            compact
                                                        />
                                                        <ColorPickerField
                                                            id="variation_option_selected_background_color"
                                                            label="Active Background"
                                                            value={getValue('variation_option_selected_background_color', '')}
                                                            onChange={(v) => updateDraft('variation_option_selected_background_color', v)}
                                                            compact
                                                        />
                                                        <ColorPickerField
                                                            id="variation_option_selected_text_color"
                                                            label="Active Text"
                                                            value={getValue('variation_option_selected_text_color', defaults.variation_option_selected_text_color ?? '#ffffff')}
                                                            onChange={(v) => updateDraft('variation_option_selected_text_color', v)}
                                                            defaultValue={defaults.variation_option_selected_text_color ?? '#ffffff'}
                                                            compact
                                                        />
                                                        <ColorPickerField
                                                            id="variation_option_selected_border_color"
                                                            label="Active Border"
                                                            value={getValue('variation_option_selected_border_color', '')}
                                                            onChange={(v) => updateDraft('variation_option_selected_border_color', v)}
                                                            compact
                                                        />
                                                    </div>
                                                    <ColorPickerField
                                                        id="variation_price_modifier_color"
                                                        label="Price Modifier"
                                                        value={getValue('variation_price_modifier_color', defaults.variation_price_modifier_color ?? '#6b7280')}
                                                        onChange={(v) => updateDraft('variation_price_modifier_color', v)}
                                                        defaultValue={defaults.variation_price_modifier_color ?? '#6b7280'}
                                                        compact
                                                    />
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <div className="space-y-1">
                                                            <Label htmlFor="variation_required_text" className="text-xs">Required Label</Label>
                                                            <Input
                                                                id="variation_required_text"
                                                                value={getValue('variation_required_text', defaults.variation_required_text ?? '* Pick 1')}
                                                                onChange={(e) => updateDraft('variation_required_text', e.target.value)}
                                                                placeholder="* Pick 1"
                                                                className="text-sm"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label htmlFor="variation_optional_text" className="text-xs">Optional Label</Label>
                                                            <Input
                                                                id="variation_optional_text"
                                                                value={getValue('variation_optional_text', defaults.variation_optional_text ?? 'Optional')}
                                                                onChange={(e) => updateDraft('variation_optional_text', e.target.value)}
                                                                placeholder="Optional"
                                                                className="text-sm"
                                                            />
                                                        </div>
                                                    </div>
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
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <ColorPickerField
                                                            id="addon_background_color"
                                                            label="Inactive Background"
                                                            value={getValue('addon_background_color', defaults.addon_background_color ?? '#ffffff')}
                                                            onChange={(v) => updateDraft('addon_background_color', v)}
                                                            defaultValue={defaults.addon_background_color ?? '#ffffff'}
                                                            compact
                                                        />
                                                        <ColorPickerField
                                                            id="addon_text_color"
                                                            label="Inactive Text"
                                                            value={getValue('addon_text_color', defaults.addon_text_color ?? '#111827')}
                                                            onChange={(v) => updateDraft('addon_text_color', v)}
                                                            defaultValue={defaults.addon_text_color ?? '#111827'}
                                                            compact
                                                        />
                                                        <ColorPickerField
                                                            id="addon_border_color"
                                                            label="Inactive Border"
                                                            value={getValue('addon_border_color', defaults.addon_border_color ?? '#e5e7eb')}
                                                            onChange={(v) => updateDraft('addon_border_color', v)}
                                                            defaultValue={defaults.addon_border_color ?? '#e5e7eb'}
                                                            compact
                                                        />
                                                        <ColorPickerField
                                                            id="addon_selected_background_color"
                                                            label="Active Background"
                                                            value={getValue('addon_selected_background_color', '')}
                                                            onChange={(v) => updateDraft('addon_selected_background_color', v)}
                                                            compact
                                                        />
                                                        <ColorPickerField
                                                            id="addon_selected_text_color"
                                                            label="Active Text"
                                                            value={getValue('addon_selected_text_color', '')}
                                                            onChange={(v) => updateDraft('addon_selected_text_color', v)}
                                                            compact
                                                        />
                                                        <ColorPickerField
                                                            id="addon_selected_border_color"
                                                            label="Active Border"
                                                            value={getValue('addon_selected_border_color', '')}
                                                            onChange={(v) => updateDraft('addon_selected_border_color', v)}
                                                            compact
                                                        />
                                                        <ColorPickerField
                                                            id="addon_selected_check_color"
                                                            label="Checkmark Background"
                                                            value={getValue('addon_selected_check_color', '')}
                                                            onChange={(v) => updateDraft('addon_selected_check_color', v)}
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
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <div className="space-y-1">
                                                            <Label htmlFor="addon_price_free_text" className="text-xs">Free Price Label</Label>
                                                            <Input
                                                                id="addon_price_free_text"
                                                                value={getValue('addon_price_free_text', defaults.addon_price_free_text ?? 'Free')}
                                                                onChange={(e) => updateDraft('addon_price_free_text', e.target.value)}
                                                                placeholder="Free"
                                                                className="text-sm"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label htmlFor="addon_optional_text" className="text-xs">Optional Label</Label>
                                                            <Input
                                                                id="addon_optional_text"
                                                                value={getValue('addon_optional_text', defaults.addon_optional_text ?? '(Optional)')}
                                                                onChange={(e) => updateDraft('addon_optional_text', e.target.value)}
                                                                placeholder="(Optional)"
                                                                className="text-sm"
                                                            />
                                                        </div>
                                                    </div>
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
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <ColorPickerField
                                                            id="footer_border_color"
                                                            label="Footer Border"
                                                            value={getValue('footer_border_color', defaults.footer_border_color ?? '#e5e7eb')}
                                                            onChange={(v) => updateDraft('footer_border_color', v)}
                                                            defaultValue={defaults.footer_border_color ?? '#e5e7eb'}
                                                            compact
                                                        />
                                                        <ColorPickerField
                                                            id="summary_text_color"
                                                            label="Summary Text"
                                                            value={getValue('summary_text_color', defaults.summary_text_color ?? '#6b7280')}
                                                            onChange={(v) => updateDraft('summary_text_color', v)}
                                                            defaultValue={defaults.summary_text_color ?? '#6b7280'}
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
                                                        <ColorPickerField
                                                            id="original_price_color"
                                                            label="Original Price"
                                                            value={getValue('original_price_color', defaults.original_price_color ?? '#9ca3af')}
                                                            onChange={(v) => updateDraft('original_price_color', v)}
                                                            defaultValue={defaults.original_price_color ?? '#9ca3af'}
                                                            compact
                                                        />
                                                        <ColorPickerField
                                                            id="quantity_controls_background"
                                                            label="Quantity Background"
                                                            value={getValue('quantity_controls_background', defaults.quantity_controls_background ?? '#f3f4f6')}
                                                            onChange={(v) => updateDraft('quantity_controls_background', v)}
                                                            defaultValue={defaults.quantity_controls_background ?? '#f3f4f6'}
                                                            compact
                                                        />
                                                        <ColorPickerField
                                                            id="quantity_button_color"
                                                            label="Quantity Icon"
                                                            value={getValue('quantity_button_color', defaults.quantity_button_color ?? '#374151')}
                                                            onChange={(v) => updateDraft('quantity_button_color', v)}
                                                            defaultValue={defaults.quantity_button_color ?? '#374151'}
                                                            compact
                                                        />
                                                        <ColorPickerField
                                                            id="quantity_text_color"
                                                            label="Quantity Text"
                                                            value={getValue('quantity_text_color', defaults.quantity_text_color ?? '#111827')}
                                                            onChange={(v) => updateDraft('quantity_text_color', v)}
                                                            defaultValue={defaults.quantity_text_color ?? '#111827'}
                                                            compact
                                                        />
                                                        <ColorPickerField
                                                            id="buy_now_button_background"
                                                            label="Buy Now Background"
                                                            value={getValue('buy_now_button_background', '')}
                                                            onChange={(v) => updateDraft('buy_now_button_background', v)}
                                                            compact
                                                        />
                                                        <ColorPickerField
                                                            id="buy_now_button_text_color"
                                                            label="Buy Now Text"
                                                            value={getValue('buy_now_button_text_color', '')}
                                                            onChange={(v) => updateDraft('buy_now_button_text_color', v)}
                                                            compact
                                                        />
                                                        <ColorPickerField
                                                            id="buy_now_button_border_color"
                                                            label="Buy Now Border"
                                                            value={getValue('buy_now_button_border_color', '')}
                                                            onChange={(v) => updateDraft('buy_now_button_border_color', v)}
                                                            compact
                                                        />
                                                        <ColorPickerField
                                                            id="add_to_cart_button_background"
                                                            label="Add to Cart Background"
                                                            value={getValue('add_to_cart_button_background', '')}
                                                            onChange={(v) => updateDraft('add_to_cart_button_background', v)}
                                                            compact
                                                        />
                                                        <ColorPickerField
                                                            id="add_to_cart_button_text_color"
                                                            label="Add to Cart Text"
                                                            value={getValue('add_to_cart_button_text_color', defaults.add_to_cart_button_text_color ?? '#ffffff')}
                                                            onChange={(v) => updateDraft('add_to_cart_button_text_color', v)}
                                                            defaultValue={defaults.add_to_cart_button_text_color ?? '#ffffff'}
                                                            compact
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <div className="space-y-1">
                                                            <Label htmlFor="footer_shadow_color" className="text-xs">Footer Shadow</Label>
                                                            <Input
                                                                id="footer_shadow_color"
                                                                value={getValue('footer_shadow_color', defaults.footer_shadow_color ?? 'rgba(0,0,0,0.1)')}
                                                                onChange={(e) => updateDraft('footer_shadow_color', e.target.value)}
                                                                placeholder="rgba(0,0,0,0.1)"
                                                                className="text-sm"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label htmlFor="add_to_cart_button_shadow_color" className="text-xs">Add to Cart Shadow</Label>
                                                            <Input
                                                                id="add_to_cart_button_shadow_color"
                                                                value={getValue('add_to_cart_button_shadow_color', defaults.add_to_cart_button_shadow_color ?? 'rgba(0,0,0,0.1)')}
                                                                onChange={(e) => updateDraft('add_to_cart_button_shadow_color', e.target.value)}
                                                                placeholder="rgba(0,0,0,0.1)"
                                                                className="text-sm"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label htmlFor="footer_empty_summary_text" className="text-xs">Empty Summary Text</Label>
                                                            <Input
                                                                id="footer_empty_summary_text"
                                                                value={getValue('footer_empty_summary_text', defaults.footer_empty_summary_text ?? 'Standard')}
                                                                onChange={(e) => updateDraft('footer_empty_summary_text', e.target.value)}
                                                                placeholder="Standard"
                                                                className="text-sm"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label htmlFor="buy_now_button_label" className="text-xs">Buy Now Label</Label>
                                                            <Input
                                                                id="buy_now_button_label"
                                                                value={getValue('buy_now_button_label', defaults.buy_now_button_label ?? 'Buy Now')}
                                                                onChange={(e) => updateDraft('buy_now_button_label', e.target.value)}
                                                                placeholder="Buy Now"
                                                                className="text-sm"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label htmlFor="add_to_cart_button_label" className="text-xs">Add to Cart Label</Label>
                                                            <Input
                                                                id="add_to_cart_button_label"
                                                                value={getValue('add_to_cart_button_label', defaults.add_to_cart_button_label ?? 'Add To Cart')}
                                                                onChange={(e) => updateDraft('add_to_cart_button_label', e.target.value)}
                                                                placeholder="Add To Cart"
                                                                className="text-sm"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </CustomizeSection>

                                            <CustomizeSection title="Popup Modal" emoji="💬">
                                                <div className="space-y-3">
                                                    <ColorPickerField
                                                        id="popup_modal_background_color"
                                                        label="Background"
                                                        value={getValue('popup_modal_background_color', '#ffffff')}
                                                        onChange={(v) => updateDraft('popup_modal_background_color', v)}
                                                        defaultValue="#ffffff"
                                                        compact
                                                    />
                                                    <ColorPickerField
                                                        id="popup_modal_title_color"
                                                        label="Title"
                                                        value={getValue('popup_modal_title_color', '#111111')}
                                                        onChange={(v) => updateDraft('popup_modal_title_color', v)}
                                                        defaultValue="#111111"
                                                        compact
                                                    />
                                                    <ColorPickerField
                                                        id="popup_modal_description_color"
                                                        label="Description"
                                                        value={getValue('popup_modal_description_color', '#6b7280')}
                                                        onChange={(v) => updateDraft('popup_modal_description_color', v)}
                                                        defaultValue="#6b7280"
                                                        compact
                                                    />
                                                    <ColorPickerField
                                                        id="popup_modal_price_color"
                                                        label="Price"
                                                        value={getValue('popup_modal_price_color', '#111111')}
                                                        onChange={(v) => updateDraft('popup_modal_price_color', v)}
                                                        defaultValue="#111111"
                                                        compact
                                                    />
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <ColorPickerField
                                                            id="popup_modal_button_color"
                                                            label="Button"
                                                            value={getValue('popup_modal_button_color', '#3b82f6')}
                                                            onChange={(v) => updateDraft('popup_modal_button_color', v)}
                                                            defaultValue="#3b82f6"
                                                            compact
                                                        />
                                                        <ColorPickerField
                                                            id="popup_modal_button_text_color"
                                                            label="Button Text"
                                                            value={getValue('popup_modal_button_text_color', '#ffffff')}
                                                            onChange={(v) => updateDraft('popup_modal_button_text_color', v)}
                                                            defaultValue="#ffffff"
                                                            compact
                                                        />
                                                    </div>
                                                    <ColorPickerField
                                                        id="popup_modal_border_color"
                                                        label="Border"
                                                        value={getValue('popup_modal_border_color', '#e5e7eb')}
                                                        onChange={(v) => updateDraft('popup_modal_border_color', v)}
                                                        defaultValue="#e5e7eb"
                                                        compact
                                                    />
                                                    {onTogglePopupPreview && (
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            className="w-full mt-2 text-sm"
                                                            onClick={onTogglePopupPreview}
                                                        >
                                                            Preview Modal
                                                        </Button>
                                                    )}
                                                </div>
                                            </CustomizeSection>

                                            <CustomizeSection title="Checkout Interstitial" emoji="🛒">
                                                <div className="space-y-3">
                                                    <ColorPickerField
                                                        id="checkout_modal_background_color"
                                                        label="Background"
                                                        value={getValue('checkout_modal_background_color', '#ffffff')}
                                                        onChange={(v) => updateDraft('checkout_modal_background_color', v)}
                                                        defaultValue="#ffffff"
                                                        compact
                                                    />
                                                    <ColorPickerField
                                                        id="checkout_modal_title_color"
                                                        label="Title"
                                                        value={getValue('checkout_modal_title_color', '#111111')}
                                                        onChange={(v) => updateDraft('checkout_modal_title_color', v)}
                                                        defaultValue="#111111"
                                                        compact
                                                    />
                                                    <ColorPickerField
                                                        id="checkout_modal_description_color"
                                                        label="Description"
                                                        value={getValue('checkout_modal_description_color', '#6b7280')}
                                                        onChange={(v) => updateDraft('checkout_modal_description_color', v)}
                                                        defaultValue="#6b7280"
                                                        compact
                                                    />
                                                    <ColorPickerField
                                                        id="checkout_modal_price_color"
                                                        label="Price"
                                                        value={getValue('checkout_modal_price_color', '#111111')}
                                                        onChange={(v) => updateDraft('checkout_modal_price_color', v)}
                                                        defaultValue="#111111"
                                                        compact
                                                    />
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <ColorPickerField
                                                            id="checkout_modal_button_color"
                                                            label="Button"
                                                            value={getValue('checkout_modal_button_color', '#3b82f6')}
                                                            onChange={(v) => updateDraft('checkout_modal_button_color', v)}
                                                            defaultValue="#3b82f6"
                                                            compact
                                                        />
                                                        <ColorPickerField
                                                            id="checkout_modal_button_text_color"
                                                            label="Button Text"
                                                            value={getValue('checkout_modal_button_text_color', '#ffffff')}
                                                            onChange={(v) => updateDraft('checkout_modal_button_text_color', v)}
                                                            defaultValue="#ffffff"
                                                            compact
                                                        />
                                                    </div>
                                                    <ColorPickerField
                                                        id="checkout_modal_border_color"
                                                        label="Border"
                                                        value={getValue('checkout_modal_border_color', '#e5e7eb')}
                                                        onChange={(v) => updateDraft('checkout_modal_border_color', v)}
                                                        defaultValue="#e5e7eb"
                                                        compact
                                                    />
                                                    {onToggleCheckoutPreview && (
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            className="w-full mt-2 text-sm"
                                                            onClick={onToggleCheckoutPreview}
                                                        >
                                                            Preview Checkout Modal
                                                        </Button>
                                                    )}
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
                                    )}
                                </>
                            )}
                        </div>

                        {/* Resize handle */}
                        <div
                            className="absolute bottom-0 right-0 z-20 h-8 w-8 cursor-se-resize"
                            onPointerDown={handleResizeStart}
                            onPointerMove={handleResizeMove}
                            onPointerUp={handleResizeEnd}
                            onPointerCancel={handleResizeEnd}
                            style={{ touchAction: 'none' }}
                            aria-label="Resize customizer window"
                            role="presentation"
                        >
                            <div className="absolute bottom-2 right-2 h-4 w-4 border-r-2 border-b-2 border-gray-400" />
                            <div className="absolute bottom-3 right-3 h-2 w-2 border-r-2 border-b-2 border-gray-300" />
                        </div>
                    </div>
                </>
            )}
        </>
    )
}
