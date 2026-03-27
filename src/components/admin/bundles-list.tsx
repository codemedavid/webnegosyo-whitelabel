'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Edit, Trash2, Eye, Package, MoreVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { formatPrice } from '@/lib/cart-utils'
import { toggleBundleActiveAction, deleteBundleAction } from '@/app/actions/bundles'
import { toast } from 'sonner'
import type { BundleWithItems } from '@/lib/bundles-service'

interface BundlesListProps {
    bundles: BundleWithItems[]
    tenantSlug: string
    tenantId: string
}

export function BundlesList({ bundles, tenantSlug, tenantId }: BundlesListProps) {
    const router = useRouter()
    const [deletingBundleId, setDeletingBundleId] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const handleToggleActive = async (bundleId: string, currentActive: boolean) => {
        const result = await toggleBundleActiveAction(bundleId, tenantId, tenantSlug, !currentActive)
        if (!result.success) {
            toast.error(result.error)
        } else {
            toast.success(currentActive ? 'Bundle deactivated' : 'Bundle activated')
            router.refresh()
        }
    }

    const handleDelete = async () => {
        if (!deletingBundleId) return
        setLoading(true)

        const result = await deleteBundleAction(deletingBundleId, tenantId, tenantSlug)
        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success('Bundle deleted')
            router.refresh()
        }

        setLoading(false)
        setDeletingBundleId(null)
    }

    if (bundles.length === 0) {
        return (
            <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                    <Package className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold">No Bundles Yet</h3>
                    <p className="text-muted-foreground text-center max-w-md mt-1">
                        Create your first bundle to offer curated menu item combinations with special pricing.
                    </p>
                    <Link href={`/${tenantSlug}/admin/bundles/new`} className="mt-4">
                        <Button>Create First Bundle</Button>
                    </Link>
                </CardContent>
            </Card>
        )
    }

    return (
        <>
            <div className="space-y-4">
                {bundles.map((bundle) => (
                    <Card key={bundle.id} className={!bundle.is_active ? 'opacity-60' : ''}>
                        <CardContent className="p-4">
                            <div className="flex items-start gap-4">
                                {/* Bundle Image */}
                                {bundle.image_url ? (
                                    <div className="h-20 w-20 rounded-lg overflow-hidden bg-muted flex-shrink-0 relative">
                                        <Image
                                            src={bundle.image_url}
                                            alt={bundle.name}
                                            fill
                                            className="object-cover"
                                            sizes="80px"
                                        />
                                    </div>
                                ) : (
                                    <div className="h-20 w-20 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                                        <Package className="h-8 w-8 text-muted-foreground" />
                                    </div>
                                )}

                                {/* Bundle Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-semibold text-lg">{bundle.name}</h3>
                                        <Badge variant={bundle.is_active ? 'default' : 'secondary'}>
                                            {bundle.is_active ? 'Active' : 'Inactive'}
                                        </Badge>
                                        {bundle.show_on_menu && (
                                            <Badge variant="outline" className="text-xs">
                                                <Eye className="h-3 w-3 mr-1" />
                                                Menu
                                            </Badge>
                                        )}
                                        {bundle.show_as_upsell && (
                                            <Badge variant="outline" className="text-xs">
                                                Upsell
                                            </Badge>
                                        )}
                                    </div>

                                    {bundle.description && (
                                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                                            {bundle.description}
                                        </p>
                                    )}

                                    {/* Items summary */}
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className="text-sm text-muted-foreground">
                                            {bundle.items?.length || 0} item{(bundle.items?.length || 0) !== 1 ? 's' : ''}
                                        </span>
                                        <span className="text-muted-foreground">·</span>
                                        <span className="text-sm font-medium">
                                            {bundle.pricing_type === 'fixed'
                                                ? formatPrice(bundle.fixed_price || 0)
                                                : `${bundle.discount_percent}% off`}
                                        </span>
                                    </div>

                                    {/* Item names */}
                                    {bundle.items && bundle.items.length > 0 && (
                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                            {bundle.items
                                                .map((item) => item.menu_item?.name || 'Unknown item')
                                                .join(', ')}
                                        </p>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <Switch
                                        checked={bundle.is_active}
                                        onCheckedChange={() =>
                                            handleToggleActive(bundle.id, bundle.is_active)
                                        }
                                    />

                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem asChild>
                                                <Link href={`/${tenantSlug}/admin/bundles/${bundle.id}`}>
                                                    <Edit className="h-4 w-4 mr-2" />
                                                    Edit
                                                </Link>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                className="text-destructive"
                                                onClick={() => setDeletingBundleId(bundle.id)}
                                            >
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Delete Confirmation Dialog */}
            <AlertDialog
                open={!!deletingBundleId}
                onOpenChange={() => setDeletingBundleId(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Bundle?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete this bundle. This action cannot be
                            undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={loading}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {loading ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
