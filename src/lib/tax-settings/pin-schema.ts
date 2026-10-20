/**
 * The "Your approval PIN" form. The shape matches the PIN route's schema
 * (4 to 6 digits); whether a PIN is too easy to guess is decided by the
 * server (`setOwnApprovalPin`), and its message is shown as-is.
 */

import { z } from 'zod'

const PIN_SHAPE = /^[0-9]{4,6}$/

export const approvalPinFormSchema = z
  .object({
    pin: z.string().regex(PIN_SHAPE, 'Use 4 to 6 numbers'),
    confirmPin: z.string(),
  })
  .refine((values) => values.pin === values.confirmPin, {
    path: ['confirmPin'],
    message: 'The two PINs do not match',
  })

export type ApprovalPinFormValues = z.input<typeof approvalPinFormSchema>

/** Who may hold an approval PIN — mirrors `setOwnApprovalPin`'s rule. */
export interface PinHolder {
  role: string
  tenantId: string | null
  /** `discount_review`, owner and full-access accounts included. */
  hasReviewPermission: boolean
}

/** A superadmin has no store account to hang a PIN on, so the card is for store accounts only. */
export function canHoldApprovalPin(holder: PinHolder, storeTenantId: string): boolean {
  return holder.role === 'admin' && holder.tenantId === storeTenantId && holder.hasReviewPermission
}
