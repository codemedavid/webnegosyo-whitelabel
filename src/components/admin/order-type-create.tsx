'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Save, Utensils, Package, Truck } from 'lucide-react'
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

interface OrderTypeCreateProps {
    tenantSlug: string
    tenantId: string
    usedTypes: ('dine_in' | 'pickup' | 'delivery')[]
    existingOrderTypesCount: number
}

const orderTypeOptions = [
    {
        type: 'dine_in' as const,
        name: 'Dine In',
        description: 'Customers eating at your restaurant',
        icon: Utensils,
        defaultDescription: 'Enjoy your meal at our restaurant',
        colorClass: 'border-green-300 bg-green-50 hover:bg-green-100',
        selectedClass: 'border-green-500 bg-green-100 ring-2 ring-green-500',
        iconColor: 'text-green-600',
    },
    {
        type: 'pickup' as const,
        name: 'Pick Up',
        description: 'Order ahead and pick up',
        icon: Package,
        defaultDescription: 'Order ahead and pick up at our location',
        colorClass: 'border-blue-300 bg-blue-50 hover:bg-blue-100',
        selectedClass: 'border-blue-500 bg-blue-100 ring-2 ring-blue-500',
        iconColor: 'text-blue-600',
    },
    {
        type: 'delivery' as const,
        name: 'Delivery',
        description: 'Deliver to customer',
        icon: Truck,
        defaultDescription: 'Get your order delivered to your door',
        colorClass: 'border-orange-300 bg-orange-50 hover:bg-orange-100',
        selectedClass: 'border-orange-500 bg-orange-100 ring-2 ring-orange-500',
        iconColor: 'text-orange-600',
    },
]

export function OrderTypeCreate({
    tenantSlug,
    tenantId,
    usedTypes,
    existingOrderTypesCount,
}: OrderTypeCreateProps) {
    const router = useRouter()
    const [isSaving, setIsSaving] = useState(false)

    const [formData, setFormData] = useState({
        type: '' as '' | 'dine_in' | 'pickup' | 'delivery',
        name: '',
        description: '',
        is_enabled: true,
    })

    // Get available types (not yet used)
    const availableTypes = orderTypeOptions.filter(opt => !usedTypes.includes(opt.type))

    const handleSelectType = (type: 'dine_in' | 'pickup' | 'delivery') => {
        const option = orderTypeOptions.find(opt => opt.type === type)
        if (option) {
            setFormData({
                ...formData,
                type,
                name: formData.name || option.name,
                description: formData.description || option.defaultDescription,
            })
        }
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

    // If all types are already used
    if (availableTypes.length === 0) {
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

                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <div className="text-muted-foreground text-center">
                            <p className="text-lg font-medium mb-2">All order types have been created</p>
                            <p className="text-sm">
                                You already have Dine In, Pick Up, and Delivery order types configured.
                            </p>
                        </div>
                        <Link href={`/${tenantSlug}/admin/order-types`} className="mt-6">
                            <Button>
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Back to Order Types
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </>
        )
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
                            Choose the type of ordering experience. Each type can only be created once.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-4 md:grid-cols-3">
                            {orderTypeOptions.map((option) => {
                                const isUsed = usedTypes.includes(option.type)
                                const isSelected = formData.type === option.type
                                const Icon = option.icon

                                return (
                                    <button
                                        key={option.type}
                                        type="button"
                                        disabled={isUsed}
                                        onClick={() => handleSelectType(option.type)}
                                        className={cn(
                                            'relative p-4 rounded-lg border-2 text-left transition-all',
                                            isUsed && 'opacity-50 cursor-not-allowed bg-muted',
                                            !isUsed && !isSelected && option.colorClass,
                                            isSelected && option.selectedClass,
                                        )}
                                    >
                                        {isUsed && (
                                            <span className="absolute top-2 right-2 text-xs bg-muted-foreground/20 px-2 py-0.5 rounded">
                                                Already exists
                                            </span>
                                        )}
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
                                        placeholder="e.g., Dine In, Pick Up, Delivery"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        The name customers will see during checkout
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
                                    You&apos;ll be taken to the configuration page where you can add custom form fields
                                    that customers will fill out during checkout (like name, phone, address, etc.).
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </>
    )
}
