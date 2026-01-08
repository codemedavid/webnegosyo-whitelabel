'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Store, ExternalLink, TrendingUp } from 'lucide-react'
import type { TenantOrderStats } from '@/lib/queries/analytics-server'

interface TopActiveTenantsProps {
    initialData3d: TenantOrderStats[]
    initialData7d: TenantOrderStats[]
    totalOrders3d: number
    totalOrders7d: number
}

export function TopActiveTenants({
    initialData3d,
    initialData7d,
    totalOrders3d,
    totalOrders7d
}: TopActiveTenantsProps) {
    const [range, setRange] = useState<'3d' | '7d'>('7d')

    const data = range === '3d' ? initialData3d : initialData7d
    const totalOrders = range === '3d' ? totalOrders3d : totalOrders7d

    return (
        <div className="space-y-6">
            {/* Summary Card */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalOrders}</div>
                    <p className="text-xs text-muted-foreground">
                        Last {range === '3d' ? '3' : '7'} days
                    </p>
                </CardContent>
            </Card>

            {/* Leaderboard Card */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Store className="h-5 w-5" />
                            Top Active Restaurants
                        </CardTitle>
                        <div className="flex gap-2">
                            <Button
                                variant={range === '3d' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setRange('3d')}
                            >
                                Last 3 Days
                            </Button>
                            <Button
                                variant={range === '7d' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setRange('7d')}
                            >
                                Last 7 Days
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {data.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            No orders found in the selected period
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {data.map((tenant, index) => (
                                <div
                                    key={tenant.tenant_id}
                                    className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
                                >
                                    <div className="flex items-center gap-4">
                                        {/* Rank Badge */}
                                        <div className={`
                      flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold
                      ${index === 0 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' : ''}
                      ${index === 1 ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' : ''}
                      ${index === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' : ''}
                      ${index > 2 ? 'bg-muted text-muted-foreground' : ''}
                    `}>
                                            {index + 1}
                                        </div>

                                        {/* Tenant Info */}
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-semibold">{tenant.tenant_name}</h3>
                                                <Badge variant={tenant.is_active ? 'default' : 'secondary'} className="text-xs">
                                                    {tenant.is_active ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </div>
                                            <p className="text-sm text-muted-foreground">/{tenant.tenant_slug}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        {/* Order Count */}
                                        <div className="text-right">
                                            <div className="text-xl font-bold">{tenant.order_count}</div>
                                            <p className="text-xs text-muted-foreground">orders</p>
                                        </div>

                                        {/* View Link */}
                                        <Link href={`/superadmin/tenants/${tenant.tenant_id}`}>
                                            <Button variant="ghost" size="icon">
                                                <ExternalLink className="h-4 w-4" />
                                            </Button>
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
