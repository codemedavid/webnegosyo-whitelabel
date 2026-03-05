'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, GripVertical, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { ImageUpload } from '@/components/shared/image-upload'
import { formatPrice } from '@/lib/cart-utils'
import { createBundleAction, updateBundleAction } from '@/app/actions/bundles'
import { toast } from 'sonner'
import type { MenuItem } from '@/types/database'
import type { BundleWithItems } from '@/lib/bundles-service'

interface BundleFormProps {
    bundle?: BundleWithItems
    tenantId: string
    tenantSlug: string
    menuItems: MenuItem[]
    suggestedItemIds?: string[]
    suggestedDiscount?: number
}

interface BundleItemEntry {
    menu_item_id: string
    quantity: number
    display_order: number
    menu_item?: MenuItem
}

export function BundleForm({
    bundle,
    tenantId,
    tenantSlug,
    menuItems,
    suggestedItemIds,
    suggestedDiscount,
}: BundleFormProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    // Form state
    const [name, setName] = useState(bundle?.name || '')
    const [description, setDescription] = useState(bundle?.description || '')
    const [imageUrl, setImageUrl] = useState(bundle?.image_url || '')
    const [pricingType, setPricingType] = useState<'fixed' | 'discount'>(
        bundle?.pricing_type || (suggestedDiscount ? 'discount' : 'fixed')
    )
    const [fixedPrice, setFixedPrice] = useState(
        bundle?.fixed_price?.toString() || ''
    )
    const [discountPercent, setDiscountPercent] = useState(
        bundle?.discount_percent?.toString() || (suggestedDiscount?.toString() ?? '')
    )
    const [isActive, setIsActive] = useState(bundle?.is_active ?? true)
    const [showOnMenu, setShowOnMenu] = useState(bundle?.show_on_menu ?? false)
    const [showAsUpsell, setShowAsUpsell] = useState(
        bundle?.show_as_upsell ?? false
    )

    // Bundle items
    const [items, setItems] = useState<BundleItemEntry[]>(() => {
        if (bundle?.items) {
            return bundle.items.map((item, index): BundleItemEntry => ({
                menu_item_id: item.menu_item_id,
                quantity: item.quantity,
                display_order: item.display_order ?? index,
                menu_item: item.menu_item,
            }))
        }
        if (suggestedItemIds && suggestedItemIds.length > 0) {
            return suggestedItemIds.reduce<BundleItemEntry[]>((acc, id, index) => {
                const menuItem = menuItems.find((mi) => mi.id === id)
                if (menuItem) {
                    acc.push({ menu_item_id: id, quantity: 1, display_order: index, menu_item: menuItem })
                }
                return acc
            }, [])
        }
        return []
    })

    // Item picker search
    const [searchQuery, setSearchQuery] = useState('')

    const filteredMenuItems = menuItems.filter(
        (mi) =>
            mi.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
            mi.is_available !== false &&
            !items.some((item) => item.menu_item_id === mi.id)
    )

    const addItem = (menuItem: MenuItem) => {
        setItems([
            ...items,
            {
                menu_item_id: menuItem.id,
                quantity: 1,
                display_order: items.length,
                menu_item: menuItem,
            },
        ])
        setSearchQuery('')
    }

    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index))
    }

    const updateItemQuantity = (index: number, quantity: number) => {
        const updated = [...items]
        updated[index].quantity = Math.max(1, quantity)
        setItems(updated)
    }

    // Calculate preview price
    const computedBasePrice = items.reduce((sum, item) => {
        const price = item.menu_item?.price || 0
        return sum + price * item.quantity
    }, 0)

    const previewPrice =
        pricingType === 'fixed'
            ? parseFloat(fixedPrice) || 0
            : computedBasePrice * (1 - (parseFloat(discountPercent) || 0) / 100)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (items.length === 0) {
            toast.error('Please add at least one item to the bundle')
            return
        }

        const input = {
            name,
            description: description || null,
            image_url: imageUrl,
            pricing_type: pricingType,
            fixed_price: pricingType === 'fixed' ? parseFloat(fixedPrice) || 0 : null,
            discount_percent:
                pricingType === 'discount' ? parseFloat(discountPercent) || 0 : null,
            is_active: isActive,
            show_on_menu: showOnMenu,
            show_as_upsell: showAsUpsell,
            display_order: bundle?.display_order ?? 0,
            items: items.map((item, index) => ({
                menu_item_id: item.menu_item_id,
                quantity: item.quantity,
                display_order: index,
            })),
        }

        startTransition(async () => {
            try {
                let result
                if (bundle) {
                    result = await updateBundleAction(bundle.id, tenantId, tenantSlug, input)
                } else {
                    result = await createBundleAction(tenantId, tenantSlug, input)
                }

                if (result.error) {
                    toast.error(result.error)
                    return
                }

                toast.success(bundle ? 'Bundle updated' : 'Bundle created')
                router.push(`/${tenantSlug}/admin/bundles`)
            } catch (err) {
                toast.error(
                    err instanceof Error ? err.message : 'Failed to save bundle'
                )
            }
        })
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
            {/* Basic Info */}
            <Card>
                <CardHeader>
                    <CardTitle>Bundle Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Name *</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Chicken Meal Deal"
                            required
                            disabled={isPending}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Describe your bundle..."
                            rows={3}
                            disabled={isPending}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Image</Label>
                        <ImageUpload
                            currentImageUrl={imageUrl}
                            onImageUploaded={setImageUrl}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Pricing */}
            <Card>
                <CardHeader>
                    <CardTitle>Pricing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant={pricingType === 'fixed' ? 'default' : 'outline'}
                            onClick={() => setPricingType('fixed')}
                            disabled={isPending}
                        >
                            Fixed Price
                        </Button>
                        <Button
                            type="button"
                            variant={pricingType === 'discount' ? 'default' : 'outline'}
                            onClick={() => setPricingType('discount')}
                            disabled={isPending}
                        >
                            Percentage Discount
                        </Button>
                    </div>

                    {pricingType === 'fixed' ? (
                        <div className="space-y-2">
                            <Label htmlFor="fixedPrice">Bundle Price *</Label>
                            <Input
                                id="fixedPrice"
                                type="number"
                                step="0.01"
                                min="0"
                                value={fixedPrice}
                                onChange={(e) => setFixedPrice(e.target.value)}
                                placeholder="0.00"
                                required
                                disabled={isPending}
                            />
                            {computedBasePrice > 0 && (
                                <p className="text-xs text-muted-foreground">
                                    Items individually would cost{' '}
                                    {formatPrice(computedBasePrice)}
                                    {parseFloat(fixedPrice) > 0 && (
                                        <> — saving {formatPrice(computedBasePrice - parseFloat(fixedPrice))}</>
                                    )}
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <Label htmlFor="discountPercent">Discount Percentage *</Label>
                            <Input
                                id="discountPercent"
                                type="number"
                                step="1"
                                min="1"
                                max="100"
                                value={discountPercent}
                                onChange={(e) => setDiscountPercent(e.target.value)}
                                placeholder="e.g., 15"
                                required
                                disabled={isPending}
                            />
                            {computedBasePrice > 0 && (
                                <p className="text-xs text-muted-foreground">
                                    Items total: {formatPrice(computedBasePrice)} →{' '}
                                    Bundle price: {formatPrice(previewPrice)}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Price preview */}
                    {items.length > 0 && (
                        <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                            <p className="text-sm font-medium text-green-800">
                                Bundle Price: {formatPrice(previewPrice)}
                            </p>
                            <p className="text-xs text-green-600 mt-0.5">
                                Variation modifiers and add-ons will be charged extra
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Bundle Items */}
            <Card>
                <CardHeader>
                    <CardTitle>Bundle Items *</CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Select menu items to include in this bundle
                    </p>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Item search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search menu items to add..."
                            className="pl-10"
                            disabled={isPending}
                        />
                    </div>

                    {/* Search results dropdown */}
                    {searchQuery.length > 0 && (
                        <div className="border rounded-lg max-h-48 overflow-y-auto">
                            {filteredMenuItems.length === 0 ? (
                                <p className="p-3 text-sm text-muted-foreground text-center">
                                    No matching items found
                                </p>
                            ) : (
                                filteredMenuItems.slice(0, 8).map((menuItem) => (
                                    <button
                                        key={menuItem.id}
                                        type="button"
                                        className="w-full px-3 py-2 text-left hover:bg-muted flex items-center justify-between gap-2 text-sm border-b last:border-0"
                                        onClick={() => addItem(menuItem)}
                                    >
                                        <span className="font-medium truncate">{menuItem.name}</span>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <span className="text-muted-foreground">
                                                {formatPrice(menuItem.price)}
                                            </span>
                                            {menuItem.bcg_classification && menuItem.bcg_classification !== 'unclassified' && (
                                                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                                    menuItem.bcg_classification === 'star' ? 'bg-yellow-100 text-yellow-800' :
                                                    menuItem.bcg_classification === 'plowhorse' ? 'bg-blue-100 text-blue-800' :
                                                    menuItem.bcg_classification === 'puzzle' ? 'bg-purple-100 text-purple-800' :
                                                    'bg-gray-100 text-gray-600'
                                                }`}>
                                                    {menuItem.bcg_classification}
                                                </span>
                                            )}
                                            <Plus className="h-4 w-4 text-primary" />
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    )}

                    {/* Selected items */}
                    {items.length === 0 ? (
                        <div className="border-2 border-dashed rounded-lg p-8 text-center">
                            <p className="text-muted-foreground">
                                No items added yet. Search above to add menu items.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {items.map((item, index) => (
                                <div
                                    key={`${item.menu_item_id}-${index}`}
                                    className="flex items-center gap-3 p-3 border rounded-lg bg-card"
                                >
                                    <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0 cursor-grab" />

                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm truncate">
                                            {item.menu_item?.name || 'Unknown item'}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {formatPrice(item.menu_item?.price || 0)}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <Label className="text-xs sr-only">Qty</Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            value={item.quantity}
                                            onChange={(e) =>
                                                updateItemQuantity(index, parseInt(e.target.value) || 1)
                                            }
                                            className="w-16 h-8 text-center text-sm"
                                            disabled={isPending}
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-destructive"
                                            onClick={() => removeItem(index)}
                                            disabled={isPending}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {items.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                            {items.length} item{items.length !== 1 ? 's' : ''} · Total base
                            price: {formatPrice(computedBasePrice)}
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Visibility Settings */}
            <Card>
                <CardHeader>
                    <CardTitle>Visibility</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="isActive">Active</Label>
                            <p className="text-xs text-muted-foreground">
                                Inactive bundles are hidden from customers
                            </p>
                        </div>
                        <Switch
                            id="isActive"
                            checked={isActive}
                            onCheckedChange={setIsActive}
                            disabled={isPending}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="showOnMenu">Show on Menu</Label>
                            <p className="text-xs text-muted-foreground">
                                Display this bundle on the customer-facing menu
                            </p>
                        </div>
                        <Switch
                            id="showOnMenu"
                            checked={showOnMenu}
                            onCheckedChange={setShowOnMenu}
                            disabled={isPending}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="showAsUpsell">Show as Upsell</Label>
                            <p className="text-xs text-muted-foreground">
                                Suggest this bundle as an upsell during checkout
                            </p>
                        </div>
                        <Switch
                            id="showAsUpsell"
                            checked={showAsUpsell}
                            onCheckedChange={setShowAsUpsell}
                            disabled={isPending}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Submit */}
            <div className="flex justify-end gap-2">
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.push(`/${tenantSlug}/admin/bundles`)}
                    disabled={isPending}
                >
                    Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                    {isPending
                        ? 'Saving...'
                        : bundle
                            ? 'Update Bundle'
                            : 'Create Bundle'}
                </Button>
            </div>
        </form>
    )
}
