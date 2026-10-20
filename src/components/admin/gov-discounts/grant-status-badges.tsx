import { Badge } from '@/components/ui/badge'
import { latestVerdict } from '@/lib/gov-discount-reports/review-queue'
import type { GrantEntry } from '@/lib/gov-discount-reports/types'

/** Taken back, and the latest review verdict — the row's state at a glance. */
export function GrantStatusBadges({ grant }: { grant: GrantEntry }) {
  const verdict = latestVerdict(grant)
  return (
    <>
      {grant.reversedAt !== null && (
        <Badge variant="outline" className="text-muted-foreground">
          Taken back
        </Badge>
      )}
      {verdict === 'ok' && (
        <Badge className="border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          Reviewed OK
        </Badge>
      )}
      {verdict === 'problem' && (
        <Badge className="border-transparent bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
          Problem noted
        </Badge>
      )}
    </>
  )
}
