import Link from 'next/link'
import { IdCard } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface GovEmptyStateProps {
  tenantSlug: string
}

const WHAT_APPEARS = [
  'Every Senior Citizen and PWD discount your cashiers give, with the name and ID number.',
  'What each discount took off — the VAT exempted and the 20% — with totals per day, cashier and branch.',
  'Any discount that did not match the rules, so you can check it with your staff.',
  'The sales books your accountant needs each month, ready to download.',
] as const

/** A store that has never recorded a Senior/PWD discount. */
export function GovEmptyState({ tenantSlug }: GovEmptyStateProps) {
  return (
    <section className="rounded-xl border border-dashed bg-card p-6 sm:p-8">
      <div className="mx-auto max-w-xl space-y-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <IdCard className="h-5 w-5 text-muted-foreground" aria-hidden />
        </span>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">No Senior or PWD discounts yet</h2>
          <p className="text-sm text-muted-foreground">
            When a cashier gives a Senior Citizen or PWD discount on the register, it shows up here:
          </p>
        </div>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          {WHAT_APPEARS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="space-y-2 pt-1">
          <p className="text-sm text-muted-foreground">
            First, tell us if your store is VAT-registered and which items the discount covers, so every
            discount is priced the same way.
          </p>
          <Button asChild>
            <Link href={`/${tenantSlug}/admin/settings/tax`}>Set up Tax &amp; discounts</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
