'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Save, Utensils, Package, Truck, Bike, ShoppingBag, Store } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { createOrderTypeAction } from '@/app/actions/order-types'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
    availableOrderTypeKinds,
    ORDER_TYPE_KIND_LABELS,
    type OrderTypeKind,
} from '@/lib/order-types/order-type-kinds'

interface OrderTypeCreateProps {
    tenantSlug: string
    tenantId: string
    usedTypes: string[]
    existingOrderTypesCount: number
}

interface OrderTypeOption {
    type: OrderTypeKind
    name: string
    description: string
    icon: typeof Utensils
    /** Name suggested when the kind is picked; null means the merchant must type one. */
    prefillName: string | null
    defaultDescription: string
    namePlaceholder: string
    colorClass: string
    selectedClass: string
    iconColor: string
}

const DEFAULT_NAME_PLACEHOLDER = 'e.g., Dine In, Pick Up, Delivery'

const orderTypeOptions: readonly OrderTypeOption[] = [
    {
        type: 'dine_in',
        name: ORDER_TYPE_KIND_LABELS.dine_in,
        description: 'Customers eating at your restaurant',
        icon: Utensils,
        prefillName: ORDER_TYPE_KIND_LABELS.dine_in,
        defaultDescription: 'Enjoy your meal at our restaurant',
        namePlaceholder: DEFAULT_NAME_PLACEHOLDER,
        colorClass: 'border-green-300 bg-green-50 hover:bg-green-100',
        selectedClass: 'border-green-500 bg-green-100 ring-2 ring-green-500',
        iconColor: 'text-green-600',
    },
    {
        type: 'pickup',
        name: ORDER_TYPE_KIND_LABELS.pickup,
        description: 'Order ahead and collect at the counter',
        icon: Package,
        prefillName: ORDER_TYPE_KIND_LABELS.pickup,
        defaultDescription: 'Order ahead and pick up at our location',
        namePlaceholder: DEFAULT_NAME_PLACEHOLDER,
        colorClass: 'border-blue-300 bg-blue-50 hover:bg-blue-100',
        selectedClass: 'border-blue-500 bg-blue-100 ring-2 ring-blue-500',
        iconColor: 'text-blue-600',
    },
    {
        type: 'delivery',
        name: ORDER_TYPE_KIND_LABELS.delivery,
        description: 'Deliver to customer',
        icon: Truck,
        prefillName: ORDER_TYPE_KIND_LABELS.delivery,
        defaultDescription: 'Get your order delivered to your door',
        namePlaceholder: DEFAULT_NAME_PLACEHOLDER,
        colorClass: 'border-orange-300 bg-orange-50 hover:bg-orange-100',
        selectedClass: 'border-orange-500 bg-orange-100 ring-2 ring-orange-500',
        iconColor: 'text-orange-600',
    },
    {
        type: 'grab',
        name: ORDER_TYPE_KIND_LABELS.grab,
        description: 'Orders placed through GrabFood',
        icon: Bike,
        prefillName: ORDER_TYPE_KIND_LABELS.grab,
        defaultDescription: 'Ordered through GrabFood',
        namePlaceholder: DEFAULT_NAME_PLACEHOLDER,
        colorClass: 'border-teal-300 bg-teal-50 hover:bg-teal-100',
        selectedClass: 'border-teal-500 bg-teal-100 ring-2 ring-teal-500',
        iconColor: 'text-teal-600',
    },
    {
        type: 'foodpanda',
        name: ORDER_TYPE_KIND_LABELS.foodpanda,
        description: 'Orders placed through foodpanda',
        icon: ShoppingBag,
        prefillName: ORDER_TYPE_KIND_LABELS.foodpanda,
        defaultDescription: 'Ordered through foodpanda',
        namePlaceholder: DEFAULT_NAME_PLACEHOLDER,
        colorClass: 'border-pink-300 bg-pink-50 hover:bg-pink-100',
        selectedClass: 'border-pink-500 bg-pink-100 ring-2 ring-pink-500',
        iconColor: 'text-pink-600',
    },
    {
        type: 'other',
        name: ORDER_TYPE_KIND_LABELS.other,
        description: 'Any channel with its own label, added as many times as you need',
        icon: Store,
        prefillName: null,
        defaultDescription: '',
        namePlaceholder: 'e.g. Shopee Food',
        colorClass: 'border-gray-300 bg-gray-50 hover:bg-gray-100',
        selectedClass: 'border-gray-500 bg-gray-100 ring-2 ring-gray-500',
        iconColor: 'text-gray-600',
    },
]

/** True when the text is one an option wrote, not something the merchant typed. */
function isSuggestedText(value: string, pick: (option: OrderTypeOption) => string | null): boolean {
    return value === '' || orderTypeOptions.some(option => pick(option) === value)
}

export function OrderTypeCreate({
    tenantSlug,
    tenantId,
    usedTypes,
    existingOrderTypesCount,
}: OrderTypeCreateProps) {
    const router = useRouter()
    const [isSaving, setIsSaving] = useState(false)

    const [formData, setFormData] = useState({
        type: '' as '' | OrderTypeKind,
        name: '',
        description: '',
        is_enabled: true,
    })

    // Singletons drop out once the store has them; Grab, foodpanda and Other
    // repeat, so they are always offered.
    const offeredKinds = new Set(availableOrderTypeKinds(usedTypes))
    const availableTypes = orderTypeOptions.filter(opt => offeredKinds.has(opt.type))
    const selectedOption = orderTypeOptions.find(opt => opt.type === formData.type)

    const handleSelectType = (type: OrderTypeKind) => {
        const option = orderTypeOptions.find(opt => opt.type === type)
        if (!option) return
        // Replace a suggested name/description, keep anything the merchant typed.
        const keepName = !isSuggestedText(formData.name, o => o.prefillName)
        const keepDescription = !isSuggestedText(formData.description, o => o.defaultDescription)
        setFormData({
            ...formData,
            type,
            name: keepName ? formData.name : (option.prefillName ?? ''),
            description: keepDescription ? formData.description : option.defaultDescription,
        })
    }

    const handleSave = async () => {
        if (!formData.type) {
            toast.error('Please select an order type')
            return
        }

        if (!formData.name.trim()) {
            toast.error('Please enter a name')
            return
        }

        setIsSaving(true)
        try {
            const result = await createOrderTypeAction(
                tenantId,
                tenantSlug,
                {
                    type: formData.type,
                    name: formData.name,
                    description: formData.description || undefined,
                    is_enabled: formData.is_enabled,
                    order_index: existingOrderTypesCount,
                }
            )

            if (result.success && result.data) {
                toast.success('Order type created successfully')
                // Navigate to the detail page to configure form fields
                router.push(`/${tenantSlug}/admin/order-types/${result.data.id}`)
            } else {
                toast.error(result.error || 'Failed to create order type')
            }
        } catch {
            toast.error('An error occurred')
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <>
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Create Order Type</h1>
                    <p className="text-muted-foreground">Add a new order type for your customers</p>
                </div>
                <Link href={`/${tenantSlug}/admin/order-types`}>
                    <Button variant="outline">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back
                    </Button>
                </Link>
            </div>

            <div className="grid gap-6">
                {/* Select Order Type */}
                <Card>
                    <CardHeader>
                        <CardTitle>Select Order Type</CardTitle>
                        <CardDescription>
                            Choose the type of ordering experience. Dine In, Pick Up and Delivery can be
                            created once; Grab, foodpanda and Other can be added as many times as you need.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-4 md:grid-cols-3">
                            {availableTypes.map((option) => {
                                const isSelected = formData.type === option.type
                                const Icon = option.icon

                                return (
                                    <button
                                        key={option.type}
                                        type="button"
                                        onClick={() => handleSelectType(option.type)}
                                        className={cn(
                                            'relative p-4 rounded-lg border-2 text-left transition-all',
                                            !isSelected && option.colorClass,
                                            isSelected && option.selectedClass,
                                        )}
                                    >
                                        <div className="flex items-center gap-3 mb-2">
                                            <Icon className={cn('h-6 w-6', option.iconColor)} />
                                            <span className="font-semibold">{option.name}</span>
                                        </div>
                                        <p className="text-sm text-muted-foreground">{option.description}</p>
                                    </button>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* Order Type Details */}
                {formData.type && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Order Type Details</CardTitle>
                            <CardDescription>
                                Customize how this order type appears to customers
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Display Name</Label>
                                    <Input
                                        id="name"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder={selectedOption?.namePlaceholder ?? DEFAULT_NAME_PLACEHOLDER}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        {selectedOption?.prefillName === null
                                            ? 'Required — the channel name customers and cashiers will see'
                                            : 'The name customers will see during checkout'}
                                    </p>
                                </div>

                                <div className="flex items-center justify-between space-y-0 p-4 border rounded-lg">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="enabled">Enable Order Type</Label>
                                        <p className="text-sm text-muted-foreground">
                                            {formData.is_enabled ? 'Visible to customers' : 'Hidden from customers'}
                                        </p>
                                    </div>
                                    <Switch
                                        id="enabled"
                                        checked={formData.is_enabled}
                                        onCheckedChange={(checked) => setFormData({ ...formData, is_enabled: checked })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Brief description shown to customers"
                                    rows={3}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Optional description to help customers understand this ordering option
                                </p>
                            </div>

                            <div className="flex justify-end gap-2 pt-4">
                                <Link href={`/${tenantSlug}/admin/order-types`}>
                                    <Button type="button" variant="outline">
                                        Cancel
                                    </Button>
                                </Link>
                                <Button onClick={handleSave} disabled={isSaving}>
                                    {isSaving ? (
                                        <>Saving...</>
                                    ) : (
                                        <>
                                            <Save className="mr-2 h-4 w-4" />
                                            Create Order Type
                                        </>
                                    )}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Info Card */}
                <Card className="bg-muted/50">
                    <CardContent className="pt-6">
                        <div className="flex items-start gap-3">
                            <Plus className="h-5 w-5 text-primary mt-0.5" />
                            <div>
                                <h4 className="font-medium">After creating the order type</h4>
                                <p className="text-sm text-muted-foreground mt-1">
                                    It starts with the checkout fields this kind normally needs — a name and a
                                    phone number, plus a table number for dine-in or an address for delivery.
                                    You&apos;ll land on the configuration page, where you can add, rename, or
                                    remove any of them.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </>
    )
}
