import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RECOVERY_DAYS } from '@/lib/order-deletion/constants'

interface DeleteOrdersCardProps {
  tenantSlug: string
  /** False for stores whose orders live in Convex, which this does not cover yet. */
  isAvailable: boolean
}

/** The settings entry to order deletion, shown to the store owner only. */
export function DeleteOrdersCard({ tenantSlug, isAvailable }: DeleteOrdersCardProps) {
  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>Delete orders</CardTitle>
        <CardDescription>
          Remove test orders or reset your dashboard. You must download a copy first, confirm with your
          password, and you can restore them for {RECOVERY_DAYS} days.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isAvailable ? (
          <Button asChild variant="outline" className="border-destructive/40 text-destructive hover:text-destructive">
            <Link href={`/${tenantSlug}/admin/settings/delete-orders`}>Delete orders…</Link>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Not available for this store yet. Contact support.</p>
        )}
      </CardContent>
    </Card>
  )
}
