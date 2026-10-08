/**
 * Sending a paid customer their set-up link.
 *
 * The link is issued only once the payment is confirmed, by staff, from the
 * checkout-leads console — or for a buyer who paid outside the funnel (cash,
 * Messenger, bank transfer) through "Invite paid customer". Pure: the message
 * text and the share links are unit-tested; nothing here sends anything, the
 * staff member's own phone or mail app does.
 */

import { z } from 'zod'
import { CHECKOUT_PAYMENT_TERMS } from '@/lib/checkout-leads/payment-terms'
import { isPaidLeadStatus } from './lead-status'

/** Only paid leads get a link: the wizard creates a store and an owner login. */
export function canSendSetupLink(leadStatus: string | null | undefined): boolean {
  return isPaidLeadStatus(leadStatus)
}

export interface SetupInviteInput {
  ownerName: string
  businessName: string
  /** Absolute set-up URL. */
  url: string
  phone?: string | null
  email?: string | null
}

export interface SetupInvite {
  message: string
  emailSubject: string
  /** Opens the staff phone's SMS app with the message; null without a usable number. */
  smsHref: string | null
  /** Opens a mail draft; null without a usable address. */
  emailHref: string | null
}

const SMS_NUMBER = /^\+?\d{7,15}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? ''
}

function smsNumber(phone: string | null | undefined): string | null {
  const compact = (phone ?? '').replace(/[\s().-]/g, '')
  return SMS_NUMBER.test(compact) ? compact : null
}

export function buildSetupInvite(input: SetupInviteInput): SetupInvite {
  const name = firstName(input.ownerName)
  const business = input.businessName.trim()
  const message = [
    `Hi${name ? ` ${name}` : ''}! Salamat — your payment is confirmed. 🎉`,
    `Here's your SmartMenu set-up link for ${business}:`,
    input.url,
    "5 minutes lang: upload your logo and a photo of your menu, and we'll build your store for you — menu, colors, combos and a loyalty card. You can go live right after.",
    'Keep this link private — it is the key to your store.',
  ].join('\n\n')
  const emailSubject = `Your SmartMenu set-up link for ${business}`

  const number = smsNumber(input.phone)
  const email = (input.email ?? '').trim()
  return {
    message,
    emailSubject,
    smsHref: number ? `sms:${number}?&body=${encodeURIComponent(message)}` : null,
    emailHref: EMAIL.test(email)
      ? `mailto:${email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(message)}`
      : null,
  }
}

/** A customer who paid outside the funnel; staff type in what the funnel form would have asked. */
export const invitePaidCustomerSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the owner's name").max(120),
    email: z.string().trim().toLowerCase().email('Enter a valid email — it becomes their login'),
    phone: z.string().trim().min(7, 'Enter a phone number').max(30),
    business_name: z.string().trim().min(2, 'Enter the business name').max(120),
    payment_term: z.enum(CHECKOUT_PAYMENT_TERMS, { message: 'Pick a plan' }),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict()

export type InvitePaidCustomerInput = z.infer<typeof invitePaidCustomerSchema>
