import Link from 'next/link'
import { Rocket } from 'lucide-react'

/**
 * Shown across the admin while the store is in pre-launch, so an onboarded
 * owner always knows their store is not public yet and where to launch it.
 */
export function PrelaunchBanner({ tenantSlug }: { tenantSlug: string }) {
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex items-center gap-2 font-medium">
        <Rocket className="h-4 w-4 shrink-0" aria-hidden />
        Your store is not public yet — customers cannot order until you launch.
      </span>
      <Link href={`/${tenantSlug}/admin/launch`} className="font-semibold underline underline-offset-2">
        Open launch checklist
      </Link>
    </div>
  )
}
