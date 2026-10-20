'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { reviewGovDiscountAction } from '@/app/actions/gov-discount-review'
import { REVIEW_NOTE_MAX } from '@/lib/gov-discount-reports/review-schema'
import type { ReviewVerdict } from '@/lib/gov-discount-reports/types'

export interface GovReviewFormProps {
  tenantId: string
  tenantSlug: string
  claimId: string
}

/**
 * Mark OK, or mark a problem with a note. A verdict is appended, never
 * edited: a second look later adds a second line to the history. The action
 * revalidates this page, so the fresh history rides back on its response.
 */
export function GovReviewForm({ tenantId, tenantSlug, claimId }: GovReviewFormProps) {
  const [note, setNote] = useState('')
  const [isWritingProblem, setIsWritingProblem] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = (verdict: ReviewVerdict) => {
    setError(null)
    startTransition(async () => {
      const result = await reviewGovDiscountAction({ tenantId, tenantSlug, claimId, verdict, note }).catch(
        () => ({ success: false as const, error: 'We could not reach the server. Check your connection and try again.' }),
      )
      if (!result.success) {
        setError(result.error ?? 'We could not save the review. Please try again.')
        return
      }
      toast.success(verdict === 'ok' ? 'Marked OK' : 'Problem noted')
      setNote('')
      setIsWritingProblem(false)
    })
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <p className="text-sm font-medium">Your review</p>

      {isWritingProblem ? (
        <div className="space-y-2">
          <Label htmlFor={`gov-review-note-${claimId}`} className="text-sm font-normal text-muted-foreground">
            What is wrong? Whoever follows it up will read this.
          </Label>
          <Textarea
            id={`gov-review-note-${claimId}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={REVIEW_NOTE_MAX}
            rows={3}
            placeholder="e.g. Same ID used twice on one table — asked Ana to check."
            disabled={isPending}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={isPending || note.trim() === ''}
              onClick={() => submit('problem')}
            >
              {isPending ? 'Saving…' : 'Save as a problem'}
            </Button>
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setIsWritingProblem(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={isPending} onClick={() => submit('ok')}>
            {isPending ? 'Saving…' : 'Mark OK'}
          </Button>
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => setIsWritingProblem(true)}>
            Mark as a problem
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
