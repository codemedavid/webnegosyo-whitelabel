/**
 * What a reviewer may send when marking a grant. The reviewer themself is
 * never in the input — the database stamps whoever is signed in.
 */

import { z } from 'zod'

export const REVIEW_NOTE_MAX = 500

export const reviewInputSchema = z
  .object({
    tenantId: z.string().uuid(),
    tenantSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/i),
    claimId: z.string().uuid(),
    verdict: z.enum(['ok', 'problem']),
    note: z
      .string()
      .max(REVIEW_NOTE_MAX, `Keep the note under ${REVIEW_NOTE_MAX} characters.`)
      .optional()
      .transform((value) => {
        const trimmed = value?.trim() ?? ''
        return trimmed === '' ? null : trimmed
      }),
  })
  .refine((input) => input.verdict === 'ok' || input.note !== null, {
    message: 'Say what the problem is, so whoever follows it up knows.',
    path: ['note'],
  })

export type ReviewInput = z.input<typeof reviewInputSchema>
export type ParsedReviewInput = z.output<typeof reviewInputSchema>
