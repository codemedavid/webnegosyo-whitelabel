import { z } from 'zod'

/**
 * Receipt-QR contact capture.
 *
 * A walk-in or POS customer whose order was rung up without a phone number
 * scans the QR on their receipt and attaches one to the order. Authorization
 * is the order's HMAC tracking token — which is printed on paper anyone can
 * photograph — so the write is strictly once-only: it fills a blank, it never
 * overwrites a contact the customer already gave.
 */

const PLACEHOLDER_CONTACTS = new Set(['', 'n/a', 'na', '-', 'none', 'walk-in'])

/** Whether a stored contact value is a real contact, not a placeholder. */
export function isRealContact(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return !PLACEHOLDER_CONTACTS.has(value.trim().toLowerCase())
}

const submissionSchema = z.object({
  orderId: z.string().trim().min(1).max(128),
  tenantId: z.string().trim().min(1).max(64),
  token: z.string().trim().min(1).max(128),
  contact: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .refine((v) => isRealContact(v), 'not a real contact'),
  name: z.string().trim().min(1).max(64).optional(),
})

export type ContactSubmission = z.infer<typeof submissionSchema>

/** Validate an untrusted request body; null on anything invalid. */
export function parseContactSubmission(body: unknown): ContactSubmission | null {
  const parsed = submissionSchema.safeParse(body)
  return parsed.success ? parsed.data : null
}

export type ContactWriteDecision =
  | { ok: true; contact: string; name: string | undefined }
  | { ok: false; error: 'already_set' }

/**
 * Decide what (if anything) the submission may write, given what the order
 * already carries. The name only fills in when the existing one is a
 * placeholder — a token holder must not be able to rename a known customer.
 */
export function decideContactWrite(
  existing: { contact?: unknown; name?: unknown },
  input: { contact: string; name?: string },
): ContactWriteDecision {
  if (isRealContact(existing.contact)) {
    return { ok: false, error: 'already_set' }
  }

  const existingName = typeof existing.name === 'string' ? existing.name.trim() : ''
  const hasRealName = existingName !== '' && existingName.toLowerCase() !== 'walk-in'

  return {
    ok: true,
    contact: input.contact,
    name: hasRealName ? undefined : input.name,
  }
}
