'use client'

import { useState, useTransition } from 'react'
import { CldUploadWidget } from 'next-cloudinary'
import { useRouter } from 'next/navigation'
import {
    Check,
    ChevronLeft,
    ChevronRight,
    GripVertical,
    ImagePlus,
    Package2,
    Plus,
    Trash2,
    X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatPrice } from '@/lib/cart-utils'
import { createBundleAction, updateBundleAction } from '@/app/actions/bundles'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { MenuItem, Category } from '@/types/database'
import type { BundleWithSlots } from '@/lib/bundles-service'

interface BundleFormProps {
    bundle?: BundleWithSlots
    tenantId: string
    tenantSlug: string
    menuItems: MenuItem[]
    categories: Category[]
    suggestedItemIds?: string[]
    suggestedDiscount?: number
}

interface BundleSlotEntry {
    id: string
    name: string
    category_id: string
    pick_count: number
    sort_order: number
}

interface PriceOverrideEntry {
    slot_id: string
    menu_item_id: string
    price_override: number
}

const STEP_TITLES = ['Basic Info', 'Slots', 'Price Overrides', 'Pricing', 'Visibility & Review'] as const

function parseNumericInput(value: string) {
    if (!value.trim()) return Number.NaN
    return Number(value)
}

function getMenuItemImage(menuItem?: MenuItem) {
    return menuItem?.image_url?.trim() || ''
}

function parseActionError(message: string) {
    try {
        const issues = JSON.parse(message) as Array<{ message?: string }>
        if (Array.isArray(issues) && issues[0]?.message) {
            return issues[0].message
        }
    } catch {
        return message
    }
    return message
}

function MenuItemThumbnail({
    menuItem,
    className,
}: {
    menuItem?: MenuItem
    className?: string
}) {
    const imageUrl = getMenuItemImage(menuItem)

    if (imageUrl) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={imageUrl} alt={menuItem?.name || 'Menu item'} className={cn('object-cover', className)} />
    }

    return (
        <div
            className={cn(
                'flex items-center justify-center bg-gray-100 text-gray-400',
                className
            )}
        >
            <Package2 className="h-4 w-4" />
        </div>
    )
}

/* ─── Step Indicator ──────────────────────────────────────────────── */

function StepIndicator({
    currentStep,
    onStepClick,
}: {
    currentStep: number
    onStepClick: (index: number) => void
}) {
    return (
        <>
            {/* Mobile: segmented progress bars */}
            <div className="mb-8 md:hidden">
                <div className="mb-3 flex items-end justify-between">
                    <h2 className="text-2xl font-extrabold tracking-tight text-gray-900">
                        {STEP_TITLES[currentStep]}
                    </h2>
                    <span className="text-xs font-bold text-gray-500">
                        Step {currentStep + 1} of {STEP_TITLES.length}
                    </span>
                </div>
                <div className="flex h-1 gap-1">
                    {STEP_TITLES.map((title, index) => (
                        <button
                            key={title}
                            type="button"
                            onClick={() => onStepClick(index)}
                            className={cn(
                                'h-full flex-1 rounded-full transition-colors',
                                index <= currentStep ? 'bg-gray-900' : 'bg-gray-200'
                            )}
                        />
                    ))}
                </div>
            </div>

            {/* Desktop: dots on a line */}
            <div className="relative mb-10 hidden md:block">
                <div className="absolute left-0 right-0 top-[7px] h-[3px] rounded-full bg-gray-200" aria-hidden="true" />
                <div
                    className="absolute left-0 top-[7px] h-[3px] rounded-full bg-gray-900 transition-all duration-300"
                    style={{ width: `${(currentStep / (STEP_TITLES.length - 1)) * 100}%` }}
                    aria-hidden="true"
                />
                <div className="relative flex justify-between">
                    {STEP_TITLES.map((title, index) => {
                        const isComplete = index < currentStep
                        const isCurrent = index === currentStep

                        return (
                            <button
                                key={title}
                                type="button"
                                onClick={() => onStepClick(index)}
                                className="flex flex-col items-center"
                            >
                                <div
                                    className={cn(
                                        'relative z-10 flex h-4 w-4 items-center justify-center rounded-full transition-all',
                                        isComplete && 'bg-gray-900',
                                        isCurrent && 'bg-gray-900 shadow-[0_0_0_4px_white]',
                                        !isComplete && !isCurrent && 'bg-gray-200'
                                    )}
                                >
                                    {isComplete && <Check className="h-2.5 w-2.5 text-white" />}
                                </div>
                                <span
                                    className={cn(
                                        'mt-2 bg-white px-2 text-xs',
                                        isComplete || isCurrent
                                            ? 'font-semibold text-gray-900'
                                            : 'font-medium text-gray-400'
                                    )}
                                >
                                    {index + 1}. {title}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </div>
        </>
    )
}

/* ─── Preview Card ────────────────────────────────────────────────── */

function BundlePreviewCard({
    imageUrl,
    name,
    description,
    slots,
    categories,
    pricingType,
    fixedPrice,
    discountPercent,
    previewPrice,
    showPricing,
    showSlots,
}: {
    imageUrl: string
    name: string
    description: string
    slots: BundleSlotEntry[]
    categories: Category[]
    pricingType: 'fixed' | 'discount'
    fixedPrice: string
    discountPercent: string
    previewPrice: number
    showPricing: boolean
    showSlots: boolean
}) {
    const resolvedName = name.trim() || 'Bundle Name'
    const resolvedDescription = description.trim() || 'Describe your bundle...'
    const hasPricingInput =
        pricingType === 'fixed' ? fixedPrice.trim().length > 0 : discountPercent.trim().length > 0

    return (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {/* Image area */}
            <div className="relative aspect-[4/3] bg-gray-200 md:aspect-square">
                {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt={resolvedName} className="h-full w-full object-cover" />
                ) : (
                    <div className="flex h-full items-center justify-center">
                        <span className="text-sm font-medium text-gray-500">Bundle Preview</span>
                    </div>
                )}
                {showPricing && hasPricingInput && (
                    <div className="absolute right-3 top-3 rounded bg-gray-900 px-3 py-1 text-white">
                        <span className="text-sm font-bold">{formatPrice(previewPrice)}</span>
                    </div>
                )}
            </div>

            <div className="p-4">
                <h4 className="text-base font-bold leading-tight text-gray-900">{resolvedName}</h4>
                <p className="mt-1 line-clamp-2 text-sm text-gray-500">{resolvedDescription}</p>

                {/* Slots list */}
                {showSlots && slots.length > 0 && (
                    <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
                        {slots.slice(0, 4).map((slot) => {
                            const cat = categories.find((c) => c.id === slot.category_id)
                            return (
                                <div key={slot.id} className="flex items-center gap-2 text-xs text-gray-600">
                                    <span className="font-medium text-gray-800">{slot.name || 'Unnamed slot'}</span>
                                    {cat && <span className="text-gray-400">— {cat.name}</span>}
                                    <span className="ml-auto shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                                        Pick {slot.pick_count}
                                    </span>
                                </div>
                            )
                        })}
                        {slots.length > 4 && (
                            <p className="text-xs text-gray-400">+ {slots.length - 4} more slots</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

/* ─── Main Form ───────────────────────────────────────────────────── */

export function BundleForm({
    bundle,
    tenantId,
    tenantSlug,
    menuItems,
    categories,
    suggestedDiscount,
}: BundleFormProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [currentStep, setCurrentStep] = useState(0)
    const [isUploading, setIsUploading] = useState(false)

    // Step 1: Basic Info
    const [name, setName] = useState(bundle?.name || '')
    const [description, setDescription] = useState(bundle?.description || '')
    const [imageUrl, setImageUrl] = useState(bundle?.image_url || '')
    const [isActive, setIsActive] = useState(bundle?.is_active ?? true)

    // Step 2: Slots
    const [slotEntries, setSlotEntries] = useState<BundleSlotEntry[]>(() => {
        if (bundle?.slots && bundle.slots.length > 0) {
            return bundle.slots.map((s) => ({
                id: s.id,
                name: s.name,
                category_id: s.category_id,
                pick_count: s.pick_count,
                sort_order: s.sort_order,
            }))
        }
        return [{ id: crypto.randomUUID(), name: '', category_id: '', pick_count: 1, sort_order: 0 }]
    })

    // Step 3: Price Overrides
    const [priceOverrides, setPriceOverrides] = useState<PriceOverrideEntry[]>(() => {
        if (bundle?.slots) {
            return bundle.slots.flatMap((s) =>
                (s.price_overrides ?? []).map((po) => ({
                    slot_id: s.id,
                    menu_item_id: po.menu_item_id,
                    price_override: po.price_override,
                }))
            )
        }
        return []
    })

    // Step 4: Pricing
    const [pricingType, setPricingType] = useState<'fixed' | 'discount'>(
        bundle?.pricing_type || (suggestedDiscount ? 'discount' : 'fixed')
    )
    const [fixedPrice, setFixedPrice] = useState(bundle?.fixed_price?.toString() || '')
    const [discountPercent, setDiscountPercent] = useState(
        bundle?.discount_percent?.toString() || (suggestedDiscount?.toString() ?? '')
    )

    // Step 5: Visibility
    const [showOnMenu, setShowOnMenu] = useState(bundle?.show_on_menu ?? false)
    const [showAsUpsell, setShowAsUpsell] = useState(bundle?.show_as_upsell ?? false)

    const fixedPriceNumber = parseNumericInput(fixedPrice)
    const discountPercentNumber = parseNumericInput(discountPercent)
    const previewPrice =
        pricingType === 'fixed'
            ? Number.isFinite(fixedPriceNumber) ? fixedPriceNumber : 0
            : 0

    const cloudinaryPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET

    /* ─── Slot helpers ────────────────────────────────────────────── */

    const addSlot = () => {
        setSlotEntries((prev) => [
            ...prev,
            {
                id: crypto.randomUUID(),
                name: '',
                category_id: '',
                pick_count: 1,
                sort_order: prev.length,
            },
        ])
    }

    const removeSlot = (slotId: string) => {
        setSlotEntries((prev) =>
            prev
                .filter((s) => s.id !== slotId)
                .map((s, i) => ({ ...s, sort_order: i }))
        )
        setPriceOverrides((prev) => prev.filter((po) => po.slot_id !== slotId))
    }

    const updateSlot = (slotId: string, changes: Partial<BundleSlotEntry>) => {
        setSlotEntries((prev) =>
            prev.map((s) => (s.id === slotId ? { ...s, ...changes } : s))
        )
        // If category changed, clear price overrides for that slot
        if (changes.category_id !== undefined) {
            setPriceOverrides((prev) => prev.filter((po) => po.slot_id !== slotId))
        }
    }

    /* ─── Price override helpers ──────────────────────────────────── */

    const getPriceOverride = (slotId: string, menuItemId: string): number => {
        return priceOverrides.find((po) => po.slot_id === slotId && po.menu_item_id === menuItemId)?.price_override ?? 0
    }

    const setPriceOverride = (slotId: string, menuItemId: string, value: number) => {
        setPriceOverrides((prev) => {
            const existing = prev.findIndex((po) => po.slot_id === slotId && po.menu_item_id === menuItemId)
            if (value <= 0) {
                // Remove the override if value is 0 or negative
                if (existing !== -1) {
                    return prev.filter((_, i) => i !== existing)
                }
                return prev
            }
            if (existing !== -1) {
                const next = [...prev]
                next[existing] = { ...next[existing], price_override: value }
                return next
            }
            return [...prev, { slot_id: slotId, menu_item_id: menuItemId, price_override: value }]
        })
    }

    /* ─── Validation ──────────────────────────────────────────────── */

    const validateStep = (stepIndex: number) => {
        if (stepIndex === 0) {
            if (name.trim().length < 2) {
                toast.error('Enter a bundle name with at least 2 characters')
                return false
            }
            return true
        }

        if (stepIndex === 1) {
            if (slotEntries.length === 0) {
                toast.error('Add at least one slot to the bundle')
                return false
            }
            for (const slot of slotEntries) {
                if (!slot.name.trim()) {
                    toast.error('Each slot must have a name')
                    return false
                }
                if (!slot.category_id) {
                    toast.error(`Slot "${slot.name || 'Unnamed'}" needs a category`)
                    return false
                }
                if (slot.pick_count < 1) {
                    toast.error(`Slot "${slot.name}" pick count must be at least 1`)
                    return false
                }
            }
            return true
        }

        // Step 2 (price overrides) has no required fields
        if (stepIndex === 2) {
            return true
        }

        if (stepIndex === 3) {
            if (pricingType === 'fixed') {
                if (!Number.isFinite(fixedPriceNumber) || fixedPriceNumber < 0) {
                    toast.error('Enter a valid fixed price')
                    return false
                }
            } else if (
                !Number.isFinite(discountPercentNumber) ||
                discountPercentNumber < 1 ||
                discountPercentNumber > 100
            ) {
                toast.error('Enter a discount percentage between 1 and 100')
                return false
            }
            return true
        }

        return true
    }

    const moveToStep = (targetStep: number) => {
        if (targetStep <= currentStep) {
            setCurrentStep(targetStep)
            return
        }

        for (let stepIndex = currentStep; stepIndex < targetStep; stepIndex += 1) {
            if (!validateStep(stepIndex)) return
        }

        setCurrentStep(targetStep)
    }

    const handleNext = () => {
        if (currentStep >= STEP_TITLES.length - 1) return
        if (!validateStep(currentStep)) return
        setCurrentStep((step) => step + 1)
    }

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (currentStep < STEP_TITLES.length - 1) {
            handleNext()
        }
    }

    const handlePublish = () => {
        if (isPending) return

        if (!validateStep(0) || !validateStep(1) || !validateStep(3)) {
            return
        }

        const input = {
            name: name.trim(),
            description: description.trim() ? description.trim() : null,
            image_url: imageUrl,
            pricing_type: pricingType,
            fixed_price: pricingType === 'fixed' ? (fixedPriceNumber ?? 0) : null,
            discount_percent: pricingType === 'discount' ? (discountPercentNumber ?? 0) : null,
            is_active: isActive,
            show_on_menu: showOnMenu,
            show_as_upsell: showAsUpsell,
            display_order: bundle?.display_order ?? 0,
            slots: slotEntries.map((slot, i) => ({
                name: slot.name,
                category_id: slot.category_id,
                pick_count: slot.pick_count,
                sort_order: i,
                price_overrides: priceOverrides
                    .filter((po) => po.slot_id === slot.id && po.price_override > 0)
                    .map((po) => ({ menu_item_id: po.menu_item_id, price_override: po.price_override })),
            })),
        }

        startTransition(async () => {
            try {
                const result = bundle
                    ? await updateBundleAction(bundle.id, tenantId, tenantSlug, input)
                    : await createBundleAction(tenantId, tenantSlug, input)

                if (!result.success) {
                    toast.error(parseActionError(result.error))
                    return
                }

                toast.success(bundle ? 'Bundle updated' : 'Bundle created')
                router.push(`/${tenantSlug}/admin/bundles`)
            } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Failed to save bundle')
            }
        })
    }

    /* ─── Preview helper ──────────────────────────────────────────── */

    const previewCard = (
        <BundlePreviewCard
            imageUrl={imageUrl}
            name={name}
            description={description}
            slots={slotEntries}
            categories={categories}
            pricingType={pricingType}
            fixedPrice={fixedPrice}
            discountPercent={discountPercent}
            previewPrice={previewPrice}
            showPricing={currentStep >= 3}
            showSlots={currentStep >= 1}
        />
    )

    /* ─── Step 1: Basic Info ──────────────────────────────────────── */

    const renderBasicInfoStep = () => (
        <div className="flex gap-8">
            <div className="max-w-2xl flex-1 space-y-6">
                {/* Image Upload */}
                <div>
                    <Label className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500 md:text-sm md:font-medium md:normal-case md:tracking-normal md:text-gray-900">
                        Bundle Hero Image
                    </Label>
                    {cloudinaryPreset ? (
                        <div className="space-y-2">
                            <div className="relative">
                                <CldUploadWidget
                                    uploadPreset={cloudinaryPreset}
                                    options={{
                                        folder: 'tenants',
                                        maxFiles: 1,
                                        resourceType: 'image',
                                        clientAllowedFormats: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
                                        maxFileSize: 5000000,
                                        sources: ['local', 'url', 'camera'],
                                        multiple: false,
                                    }}
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    onSuccess={(result: any) => {
                                        setIsUploading(false)
                                        if (result?.info?.secure_url) {
                                            setImageUrl(result.info.secure_url)
                                        }
                                    }}
                                    onOpen={() => setIsUploading(true)}
                                    onClose={() => setIsUploading(false)}
                                >
                                    {({ open }) => (
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.preventDefault()
                                                open()
                                            }}
                                            disabled={isPending || isUploading}
                                            className={cn(
                                                'group relative flex w-full flex-col items-center justify-center overflow-hidden transition-colors',
                                                'aspect-video rounded-xl md:aspect-auto md:h-64 md:rounded-lg',
                                                imageUrl
                                                    ? 'border border-gray-200 bg-gray-50'
                                                    : 'border-2 border-dashed border-gray-300 bg-gray-50 hover:border-gray-900 hover:bg-gray-100',
                                                (isPending || isUploading) && 'cursor-not-allowed opacity-60'
                                            )}
                                        >
                                            {imageUrl ? (
                                                <>
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={imageUrl}
                                                        alt="Bundle artwork preview"
                                                        className="absolute inset-0 h-full w-full object-cover"
                                                    />
                                                    <div className="absolute inset-0 bg-black/30 opacity-0 transition group-hover:opacity-100" />
                                                    <div className="relative z-10 text-white opacity-0 transition group-hover:opacity-100">
                                                        <ImagePlus className="mx-auto mb-2 h-8 w-8" />
                                                        <p className="text-sm font-medium">Change image</p>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="text-center">
                                                    <ImagePlus className="mx-auto mb-2 h-10 w-10 text-gray-400" />
                                                    <p className="text-sm font-medium text-gray-900">
                                                        Upload Cover Photo
                                                    </p>
                                                    <p className="mt-1 text-[10px] text-gray-500 md:text-xs">
                                                        Recommended: 16:9 Aspect Ratio
                                                    </p>
                                                </div>
                                            )}
                                        </button>
                                    )}
                                </CldUploadWidget>

                                {imageUrl && !isPending && (
                                    <button
                                        type="button"
                                        onClick={() => setImageUrl('')}
                                        className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-gray-600 shadow-sm transition hover:bg-white hover:text-gray-900"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            Cloudinary upload is not configured. Set{' '}
                            <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">
                                NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
                            </code>{' '}
                            to enable image uploads.
                        </div>
                    )}
                </div>

                {/* Name */}
                <div>
                    <Label htmlFor="bundle-name" className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500 md:mb-1 md:text-sm md:font-medium md:normal-case md:tracking-normal md:text-gray-900">
                        Bundle Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                        id="bundle-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Chicken Meal Deal"
                        disabled={isPending}
                        className="h-12 rounded-none border-0 border-b-2 border-gray-200 px-0 text-lg font-bold shadow-none placeholder:text-gray-300 focus:border-gray-900 focus-visible:ring-0 md:h-10 md:rounded-md md:border md:border-gray-300 md:px-3 md:text-sm md:font-normal md:placeholder:text-gray-400"
                    />
                </div>

                {/* Description */}
                <div>
                    <Label htmlFor="bundle-description" className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500 md:mb-1 md:text-sm md:font-medium md:normal-case md:tracking-normal md:text-gray-900">
                        Description
                    </Label>
                    <div className="rounded-xl bg-gray-50 p-4 md:rounded-none md:bg-transparent md:p-0">
                        <Textarea
                            id="bundle-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Describe your bundle..."
                            rows={4}
                            disabled={isPending}
                            className="resize-y border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0 md:rounded-md md:border md:border-gray-300 md:px-3 md:py-2"
                        />
                    </div>
                </div>

                {/* Active toggle */}
                <div className="flex items-center justify-between gap-4 rounded-lg bg-gray-50 p-4 md:rounded-none md:bg-transparent md:p-0">
                    <div>
                        <p className="text-sm font-semibold text-gray-900">Active</p>
                        <p className="text-xs text-gray-500">Inactive bundles are hidden from customers</p>
                    </div>
                    <Switch checked={isActive} onCheckedChange={setIsActive} disabled={isPending} />
                </div>
            </div>

            {/* Preview sidebar — desktop only */}
            <aside className="hidden w-80 shrink-0 xl:block">
                <div className="sticky top-8">{previewCard}</div>
            </aside>
        </div>
    )

    /* ─── Step 2: Slots ───────────────────────────────────────────── */

    const renderSlotsStep = () => (
        <div className="flex gap-8">
            <div className="max-w-2xl flex-1 space-y-4">
                <p className="text-sm text-gray-500">
                    Each slot represents a choice the customer makes. Assign a category and how many items they can pick from it.
                </p>

                {slotEntries.map((slot, index) => (
                    <div
                        key={slot.id}
                        className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                    >
                        {/* Slot header */}
                        <div className="mb-4 flex items-center gap-3">
                            <div className="flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-md bg-gray-100 text-gray-400 active:cursor-grabbing">
                                <GripVertical className="h-4 w-4" />
                            </div>
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
                                Slot {index + 1}
                            </span>
                            <button
                                type="button"
                                onClick={() => removeSlot(slot.id)}
                                disabled={isPending || slotEntries.length <= 1}
                                className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                                title="Remove slot"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* Slot name */}
                            <div>
                                <Label htmlFor={`slot-name-${slot.id}`} className="mb-1.5 block text-xs font-semibold text-gray-700">
                                    Slot Name <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id={`slot-name-${slot.id}`}
                                    value={slot.name}
                                    onChange={(e) => updateSlot(slot.id, { name: e.target.value })}
                                    placeholder="e.g., Main Dish, Side, Drink"
                                    disabled={isPending}
                                    className="h-10 rounded-md border-gray-300 text-sm"
                                />
                            </div>

                            {/* Category + Pick Count side by side */}
                            <div className="grid grid-cols-[1fr_auto] gap-3">
                                <div>
                                    <Label htmlFor={`slot-category-${slot.id}`} className="mb-1.5 block text-xs font-semibold text-gray-700">
                                        Category <span className="text-red-500">*</span>
                                    </Label>
                                    <Select
                                        value={slot.category_id}
                                        onValueChange={(value) => updateSlot(slot.id, { category_id: value })}
                                        disabled={isPending}
                                    >
                                        <SelectTrigger id={`slot-category-${slot.id}`} className="h-10 rounded-md border-gray-300 text-sm">
                                            <SelectValue placeholder="Select category..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {categories.length === 0 ? (
                                                <SelectItem value="_none" disabled>No categories found</SelectItem>
                                            ) : (
                                                categories.map((cat) => {
                                                    const itemCount = menuItems.filter((mi) => mi.category_id === cat.id).length
                                                    return (
                                                        <SelectItem key={cat.id} value={cat.id}>
                                                            {cat.name}
                                                            <span className="ml-1 text-xs text-gray-400">({itemCount})</span>
                                                        </SelectItem>
                                                    )
                                                })
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="w-28">
                                    <Label htmlFor={`slot-pick-${slot.id}`} className="mb-1.5 block text-xs font-semibold text-gray-700">
                                        Pick Count
                                    </Label>
                                    <Input
                                        id={`slot-pick-${slot.id}`}
                                        type="number"
                                        min="1"
                                        value={slot.pick_count}
                                        onChange={(e) => {
                                            const v = parseInt(e.target.value, 10)
                                            if (!isNaN(v) && v >= 1) {
                                                updateSlot(slot.id, { pick_count: v })
                                            }
                                        }}
                                        disabled={isPending}
                                        className="h-10 rounded-md border-gray-300 text-center text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                <button
                    type="button"
                    onClick={addSlot}
                    disabled={isPending}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-4 text-sm font-semibold text-gray-500 transition-colors hover:border-gray-900 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    <Plus className="h-4 w-4" />
                    Add Slot
                </button>
            </div>

            {/* Preview sidebar — desktop only */}
            <aside className="hidden w-80 shrink-0 xl:block">
                <div className="sticky top-8">{previewCard}</div>
            </aside>
        </div>
    )

    /* ─── Step 3: Price Overrides ─────────────────────────────────── */

    const renderPriceOverridesStep = () => (
        <div className="flex gap-8">
            <div className="max-w-2xl flex-1 space-y-6">
                <p className="text-sm text-gray-500">
                    By default all items in a slot are included at no extra charge. You can add a premium price for specific items.
                </p>

                {slotEntries.map((slot, slotIndex) => {
                    const slotItems = menuItems.filter((mi) => mi.category_id === slot.category_id)

                    return (
                        <div key={slot.id} className="rounded-xl border border-gray-200 bg-white shadow-sm">
                            {/* Slot header */}
                            <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
                                <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
                                    Slot {slotIndex + 1}
                                </span>
                                <span className="font-semibold text-gray-900">{slot.name || 'Unnamed slot'}</span>
                                {categories.find((c) => c.id === slot.category_id) && (
                                    <span className="ml-auto text-xs text-gray-400">
                                        {categories.find((c) => c.id === slot.category_id)?.name}
                                    </span>
                                )}
                            </div>

                            {slotItems.length === 0 ? (
                                <div className="px-4 py-6 text-center text-sm text-gray-500">
                                    {slot.category_id
                                        ? 'No items in this category.'
                                        : 'Select a category for this slot first.'}
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-50">
                                    {slotItems.map((item) => {
                                        const override = getPriceOverride(slot.id, item.id)
                                        return (
                                            <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                                                <MenuItemThumbnail
                                                    menuItem={item}
                                                    className="h-10 w-10 shrink-0 rounded-md border border-gray-200"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium text-gray-900">{item.name}</p>
                                                    <p className="text-xs text-gray-500">{formatPrice(item.price)}</p>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {override > 0 ? (
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-xs text-gray-500">+₱</span>
                                                            <Input
                                                                type="number"
                                                                step="0.01"
                                                                min="0"
                                                                value={override}
                                                                onChange={(e) => {
                                                                    const v = parseFloat(e.target.value)
                                                                    setPriceOverride(slot.id, item.id, isNaN(v) ? 0 : v)
                                                                }}
                                                                disabled={isPending}
                                                                className="h-8 w-20 rounded-md border-gray-300 text-right text-sm"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => setPriceOverride(slot.id, item.id, 0)}
                                                                disabled={isPending}
                                                                className="ml-1 text-gray-400 transition-colors hover:text-red-500"
                                                            >
                                                                <X className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                                                                Included
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => setPriceOverride(slot.id, item.id, 0.01)}
                                                                disabled={isPending}
                                                                className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-500 transition-colors hover:border-gray-500 hover:text-gray-800"
                                                            >
                                                                + Add premium
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Preview sidebar — desktop only */}
            <aside className="hidden w-80 shrink-0 xl:block">
                <div className="sticky top-8">{previewCard}</div>
            </aside>
        </div>
    )

    /* ─── Step 4: Pricing ─────────────────────────────────────────── */

    const renderPricingStep = () => (
        <div className="flex gap-8 lg:gap-12">
            <div className="max-w-xl flex-1">
                {/* Pricing type toggle — mobile: cards, desktop: pills */}
                {/* Mobile cards */}
                <div className="mb-8 grid grid-cols-2 gap-3 md:hidden">
                    <button
                        type="button"
                        onClick={() => setPricingType('fixed')}
                        disabled={isPending}
                        className={cn(
                            'flex flex-col rounded-xl p-4 text-left transition-all active:scale-[0.98]',
                            pricingType === 'fixed'
                                ? 'border-b-2 border-gray-900 bg-white'
                                : 'bg-gray-50'
                        )}
                    >
                        <span className={cn('text-sm font-bold', pricingType === 'fixed' ? 'text-gray-900' : 'text-gray-500')}>Fixed Price</span>
                        <span className="mt-0.5 text-[10px] uppercase tracking-tight text-gray-500">Set total amount</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setPricingType('discount')}
                        disabled={isPending}
                        className={cn(
                            'flex flex-col rounded-xl p-4 text-left transition-all active:scale-[0.98]',
                            pricingType === 'discount'
                                ? 'border-b-2 border-gray-900 bg-white'
                                : 'bg-gray-50'
                        )}
                    >
                        <span className={cn('text-sm font-bold', pricingType === 'discount' ? 'text-gray-900' : 'text-gray-500')}>Percentage</span>
                        <span className="mt-0.5 text-[10px] uppercase tracking-tight text-gray-500">Discount total</span>
                    </button>
                </div>

                {/* Desktop pills */}
                <div className="mb-8 hidden rounded-full border border-gray-300 bg-white p-1 md:flex">
                    <button
                        type="button"
                        onClick={() => setPricingType('fixed')}
                        disabled={isPending}
                        className={cn(
                            'flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                            pricingType === 'fixed' ? 'bg-gray-900 font-semibold text-white' : 'text-gray-700 hover:bg-gray-50'
                        )}
                    >
                        Fixed Price
                    </button>
                    <button
                        type="button"
                        onClick={() => setPricingType('discount')}
                        disabled={isPending}
                        className={cn(
                            'flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                            pricingType === 'discount' ? 'bg-gray-900 font-semibold text-white' : 'text-gray-700 hover:bg-gray-50'
                        )}
                    >
                        Discount Percentage
                    </button>
                </div>

                {/* Price input */}
                <div className="mb-8">
                    {pricingType === 'fixed' ? (
                        <div>
                            <Label htmlFor="fixed-price" className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500 md:text-sm md:font-semibold md:normal-case md:tracking-normal md:text-gray-900">
                                Set Bundle Price <span className="text-red-500">*</span>
                            </Label>
                            <div className="rounded-xl bg-white p-4 md:rounded-none md:bg-transparent md:p-0">
                                <div className="flex items-center border-b-2 border-gray-200 py-2 transition-colors focus-within:border-gray-900 md:border-0">
                                    <span className="mr-2 text-3xl font-bold text-gray-900 md:pointer-events-none md:absolute md:left-3 md:top-1/2 md:mr-0 md:-translate-y-1/2 md:text-lg md:font-normal md:text-gray-500">
                                        ₱
                                    </span>
                                    <Input
                                        id="fixed-price"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={fixedPrice}
                                        onChange={(e) => setFixedPrice(e.target.value)}
                                        placeholder="0.00"
                                        disabled={isPending}
                                        className="h-auto border-0 bg-transparent p-0 text-4xl font-bold shadow-none focus-visible:ring-0 md:h-12 md:rounded-lg md:border-2 md:border-gray-800 md:pl-8 md:pr-4 md:text-lg"
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <Label htmlFor="discount-percent" className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500 md:text-sm md:font-semibold md:normal-case md:tracking-normal md:text-gray-900">
                                Discount Percentage <span className="text-red-500">*</span>
                            </Label>
                            <div className="rounded-xl bg-white p-4 md:rounded-none md:bg-transparent md:p-0">
                                <div className="relative flex items-center border-b-2 border-gray-200 py-2 transition-colors focus-within:border-gray-900 md:border-0">
                                    <Input
                                        id="discount-percent"
                                        type="number"
                                        step="1"
                                        min="1"
                                        max="100"
                                        value={discountPercent}
                                        onChange={(e) => setDiscountPercent(e.target.value)}
                                        placeholder="15"
                                        disabled={isPending}
                                        className="h-auto border-0 bg-transparent p-0 text-4xl font-bold shadow-none focus-visible:ring-0 md:h-12 md:rounded-lg md:border-2 md:border-gray-800 md:pl-4 md:pr-10 md:text-lg"
                                    />
                                    <span className="ml-2 text-3xl font-bold text-gray-500 md:pointer-events-none md:absolute md:right-4 md:top-1/2 md:-translate-y-1/2 md:ml-0 md:text-lg">
                                        %
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Mobile live preview */}
                <div className="mb-8 md:hidden">
                    {previewCard}
                </div>
            </div>

            {/* Preview sidebar — desktop only */}
            <aside className="hidden w-80 shrink-0 lg:block">
                <div className="sticky top-8">{previewCard}</div>
            </aside>
        </div>
    )

    /* ─── Step 5: Visibility & Review ─────────────────────────────── */

    const renderReviewStep = () => (
        <div className="space-y-8 md:grid md:grid-cols-[1fr_320px] md:gap-12 md:space-y-0">
            {/* Left column: Settings */}
            <div className="space-y-8">
                {/* Final preview — mobile only */}
                <div className="md:hidden">
                    <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-500">Final Preview</h3>
                    {previewCard}
                </div>

                {/* Visibility Settings */}
                <section>
                    <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-500 md:mb-6 md:text-lg md:font-bold md:normal-case md:tracking-normal md:text-gray-900">
                        Visibility & Logic
                    </h3>
                    <div className="space-y-3 md:space-y-5">
                        {/* Show on menu */}
                        <div className="flex items-center justify-between gap-4 rounded-lg bg-gray-50 p-4 md:rounded-none md:bg-transparent md:p-0">
                            <div>
                                <p className="text-sm font-semibold text-gray-900">Show on menu</p>
                                <p className="text-xs text-gray-500">Display this bundle on the customer-facing menu</p>
                            </div>
                            <Switch checked={showOnMenu} onCheckedChange={setShowOnMenu} disabled={isPending} />
                        </div>
                        {/* Show as upsell */}
                        <div className="flex items-center justify-between gap-4 rounded-lg bg-gray-50 p-4 md:rounded-none md:bg-transparent md:p-0">
                            <div>
                                <p className="text-sm font-semibold text-gray-900">Show as upsell</p>
                                <p className="text-xs text-gray-500">Suggest this bundle as an upsell during checkout</p>
                            </div>
                            <Switch checked={showAsUpsell} onCheckedChange={setShowAsUpsell} disabled={isPending} />
                        </div>
                    </div>
                </section>

                <hr className="border-gray-200" />

                {/* Bundle Summary */}
                <section>
                    <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-500 md:text-lg md:font-bold md:normal-case md:tracking-normal md:text-gray-900">
                        Bundle Summary
                    </h3>
                    <dl className="space-y-2 text-sm">
                        <div className="grid grid-cols-[120px_1fr] gap-2">
                            <dt className="font-semibold text-gray-900">Slots:</dt>
                            <dd className="text-gray-700">
                                {slotEntries.length === 0
                                    ? 'No slots configured'
                                    : slotEntries.map((s) => s.name || 'Unnamed').join(', ')}
                            </dd>
                        </div>
                        <div className="grid grid-cols-[120px_1fr] gap-2">
                            <dt className="font-semibold text-gray-900">Price:</dt>
                            <dd className="text-gray-700">
                                {pricingType === 'fixed'
                                    ? `${formatPrice(previewPrice)} (Fixed)`
                                    : `${discountPercent || 0}% off`}
                            </dd>
                        </div>
                        <div className="grid grid-cols-[120px_1fr] gap-2">
                            <dt className="font-semibold text-gray-900">Visibility:</dt>
                            <dd className="flex flex-wrap gap-1.5 text-gray-700">
                                <span
                                    className={cn(
                                        'rounded-full px-2 py-0.5 text-xs font-medium',
                                        isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'
                                    )}
                                >
                                    {isActive ? 'Active' : 'Inactive'}
                                </span>
                                {showOnMenu && (
                                    <span className="rounded-full bg-gray-900 px-2 py-0.5 text-xs font-medium text-white">Menu</span>
                                )}
                                {showAsUpsell && (
                                    <span className="rounded-full bg-gray-900 px-2 py-0.5 text-xs font-medium text-white">Upsell</span>
                                )}
                            </dd>
                        </div>
                    </dl>
                </section>

                {/* Mobile: full-width publish button */}
                <div className="md:hidden">
                    <Button
                        type="button"
                        onClick={handlePublish}
                        disabled={isPending}
                        className="w-full rounded-md bg-gray-900 py-6 text-lg font-bold text-white shadow-lg active:scale-95"
                    >
                        {isPending ? 'Saving...' : bundle ? 'Save Changes' : 'Publish Bundle'}
                    </Button>
                </div>
            </div>

            {/* Right column: Preview — desktop only */}
            <div className="hidden flex-col items-center md:flex">
                <div className="w-full max-w-[320px]">{previewCard}</div>
            </div>
        </div>
    )

    /* ─── Main Render ─────────────────────────────────────────────── */

    return (
        <form onSubmit={handleFormSubmit} className="pb-28 md:pb-0">
            {/* Header — hidden on mobile (step indicator handles it) */}
            <div className="mb-8 hidden md:block">
                <h2 className="text-2xl font-bold text-gray-900">
                    {bundle ? 'Edit Bundle' : 'Create Bundle'}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                    Configure slots so customers can mix and match their own bundle
                </p>
            </div>

            {/* Step progress */}
            <StepIndicator currentStep={currentStep} onStepClick={moveToStep} />

            {/* Step content */}
            <div className="mb-8">
                {currentStep === 0 && renderBasicInfoStep()}
                {currentStep === 1 && renderSlotsStep()}
                {currentStep === 2 && renderPriceOverridesStep()}
                {currentStep === 3 && renderPricingStep()}
                {currentStep === 4 && renderReviewStep()}
            </div>

            {/* Desktop footer */}
            <div className="hidden justify-end gap-3 border-t border-gray-200 pt-6 md:flex">
                {currentStep === 0 ? (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => router.push(`/${tenantSlug}/admin/bundles`)}
                        disabled={isPending}
                        className="rounded-md border-gray-300 px-4 py-2 text-sm font-medium shadow-sm"
                    >
                        Cancel
                    </Button>
                ) : (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setCurrentStep((step) => Math.max(0, step - 1))}
                        disabled={isPending}
                        className="rounded-md border-gray-300 px-4 py-2 text-sm font-medium shadow-sm"
                    >
                        <ChevronLeft className="mr-1 h-4 w-4" />
                        Back: {STEP_TITLES[currentStep - 1]}
                    </Button>
                )}

                {currentStep < STEP_TITLES.length - 1 ? (
                    <Button
                        type="button"
                        onClick={handleNext}
                        disabled={isPending}
                        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800"
                    >
                        Next: {STEP_TITLES[currentStep + 1]}
                        <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                ) : (
                    <Button
                        type="button"
                        onClick={handlePublish}
                        disabled={isPending}
                        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-black"
                    >
                        {isPending ? 'Saving...' : bundle ? 'Save Changes' : 'Publish Bundle'}
                    </Button>
                )}
            </div>

            {/* Mobile fixed bottom nav */}
            <nav className="fixed inset-x-0 bottom-0 z-50 flex items-center border-t border-gray-100 bg-white px-4 py-3 shadow-[0_-8px_20px_rgba(0,0,0,0.04)] md:hidden">
                {currentStep === 0 ? (
                    <button
                        type="button"
                        onClick={() => router.push(`/${tenantSlug}/admin/bundles`)}
                        disabled={isPending}
                        className="flex w-1/3 flex-col items-center justify-center py-2 text-gray-400"
                    >
                        <ChevronLeft className="mb-0.5 h-5 w-5" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Cancel</span>
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => setCurrentStep((step) => Math.max(0, step - 1))}
                        disabled={isPending}
                        className="flex w-1/3 flex-col items-center justify-center py-2 text-gray-400"
                    >
                        <ChevronLeft className="mb-0.5 h-5 w-5" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Back</span>
                    </button>
                )}

                {currentStep < STEP_TITLES.length - 1 ? (
                    <button
                        type="button"
                        onClick={handleNext}
                        disabled={isPending}
                        className="ml-auto flex h-12 w-2/3 items-center justify-center rounded-xl bg-gray-900 text-sm font-bold text-white"
                    >
                        Next: {STEP_TITLES[currentStep + 1]}
                        <ChevronRight className="ml-1 h-4 w-4" />
                    </button>
                ) : null}
            </nav>
        </form>
    )
}
