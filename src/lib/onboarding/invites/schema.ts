/** What staff type to make a sign-up link, and what the customer types to use it. */

import { z } from 'zod'
import { CHECKOUT_PAYMENT_TERMS } from '@/lib/checkout-leads/payment-terms'
import { invitePaidCustomerSchema } from '../invite'
import { INVITE_EXPIRY_DAYS } from './status'

export const createInviteSchema = z
  .object({
    label: z.string().trim().min(2, 'Name the link, e.g. who it is for').max(120),
    payment_term: z.enum(CHECKOUT_PAYMENT_TERMS, { message: 'Pick a plan' }),
    expires_in_days: z.union(
      [z.literal(INVITE_EXPIRY_DAYS[0]), z.literal(INVITE_EXPIRY_DAYS[1]), z.literal(INVITE_EXPIRY_DAYS[2]), z.literal(INVITE_EXPIRY_DAYS[3])],
      { message: 'Pick when the link expires' },
    ),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict()

export type CreateInviteInput = z.infer<typeof createInviteSchema>

/**
 * The customer's own details — the same fields staff type for "Invite paid
 * customer". The plan and the paid status come from the link, never the form.
 */
export const joinFormSchema = invitePaidCustomerSchema.pick({ name: true, business_name: true, email: true, phone: true }).strict()

export type JoinFormInput = z.infer<typeof joinFormSchema>
