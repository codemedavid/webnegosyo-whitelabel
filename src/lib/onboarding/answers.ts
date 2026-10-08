/**
 * What the buyer tells the set-up wizard, validated once at the boundary.
 *
 * The owner password travels with the submit but is NEVER part of the stored
 * answers: it is used to create the login in the same request and dropped.
 */

import { z } from 'zod'
import { STORE_TYPES, type StoreType } from './store-type'

export const ONBOARDING_ORDER_TYPES = ['dine_in', 'pickup', 'delivery'] as const
export type OnboardingOrderType = (typeof ONBOARDING_ORDER_TYPES)[number]

export const MAX_BEST_SELLERS = 3
export const MAX_MENU_PHOTOS = 3
export const MAX_ONBOARDING_MENU_TEXT = 20_000
export const MIN_OWNER_PASSWORD = 8
/** bcrypt (GoTrue) ignores bytes past 72. */
export const MAX_OWNER_PASSWORD = 72

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const HEX_COLOR = /^#[0-9a-f]{6}$/i
/** PH mobile: 09XXXXXXXXX or +639XXXXXXXXX, spaces/dashes allowed. */
const PH_MOBILE = /^(\+?63|0)9\d{9}$/

const walletSchema = z
  .object({
    number: z
      .string()
      .trim()
      .transform((value) => value.replace(/[\s-]/g, ''))
      .refine((value) => PH_MOBILE.test(value), 'Enter an 11-digit mobile number like 0917 123 4567'),
    accountName: z.string().trim().min(2, 'Enter the account name').max(80),
  })
  .strict()

const STORE_TYPE_IDS = Object.keys(STORE_TYPES) as [StoreType, ...StoreType[]]
const storeTypeSchema = z.enum(STORE_TYPE_IDS, { message: 'Pick a store type' })

export const onboardingAnswersSchema = z
  .object({
    storeName: z.string().trim().min(2, 'Enter your store name').max(60),
    storeType: storeTypeSchema,
    tagline: z.string().trim().max(120).optional().or(z.literal('')),
    /** The owner's pick in the wizard; null = use the logo's color. */
    brandColor: z
      .string()
      .regex(HEX_COLOR, 'Pick a color from the list')
      .transform((value) => value.toLowerCase())
      .nullable()
      .optional(),
    menuText: z.string().trim().max(MAX_ONBOARDING_MENU_TEXT).optional().or(z.literal('')),
    bestSellers: z.array(z.string().trim().min(1).max(80)).max(MAX_BEST_SELLERS).default([]),
    orderTypes: z.array(z.enum(ONBOARDING_ORDER_TYPES)).min(1, 'Pick at least one way to order'),
    payments: z
      .object({
        cash: z.boolean(),
        gcash: walletSchema.nullable().optional(),
        maya: walletSchema.nullable().optional(),
      })
      .strict()
      .refine((p) => p.cash || !!p.gcash || !!p.maya, 'Pick at least one way to pay'),
    hours: z
      .object({
        open: z.string().regex(HHMM, 'Use a time like 09:00'),
        close: z.string().regex(HHMM, 'Use a time like 21:00'),
        closedDays: z.array(z.number().int().min(0).max(6)).max(6).default([]),
        stopOrdersWhenClosed: z.boolean().default(true),
      })
      .strict()
      .refine((h) => h.close > h.open, 'Closing time must be later than opening time (same day)'),
  })
  .strict()

export type OnboardingAnswers = z.infer<typeof onboardingAnswersSchema>

export const onboardingSubmitSchema = z
  .object({
    answers: onboardingAnswersSchema,
    ownerPassword: z
      .string()
      .min(MIN_OWNER_PASSWORD, `Use at least ${MIN_OWNER_PASSWORD} characters`)
      .max(MAX_OWNER_PASSWORD, `Use at most ${MAX_OWNER_PASSWORD} characters`),
  })
  .strict()

export type OnboardingSubmit = z.infer<typeof onboardingSubmitSchema>

/** First validation message, for a one-line error the buyer can act on. */
export function describeAnswersError(error: z.ZodError): string {
  const issue = error.issues[0]
  return issue?.message ?? 'Please check your answers.'
}
