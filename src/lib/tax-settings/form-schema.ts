/**
 * The "Tax & discounts" settings form, validated the same way in the browser
 * (React Hook Form) and in the server action that saves it.
 *
 * Every limit mirrors a `store_tax_profiles` constraint, so a value the form
 * accepts is never refused by the database with an unreadable error.
 */

import { z } from 'zod'
import { BRANCH_CODE_PATTERN, TIN_PATTERN, splitTin } from './tin'

export const TAX_TEXT_LIMITS = {
  registeredName: 160,
  businessAddress: 300,
  posMin: 40,
  posSerialNo: 60,
  posPtuNo: 60,
} as const

/** The database caps the threshold here (`store_tax_profiles_threshold_ck`). */
export const MAX_APPROVAL_THRESHOLD = 1_000_000

const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/

const text = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer`)

export const taxSettingsFormSchema = z
  .object({
    vatStatus: z.enum(['vat', 'non_vat'], { message: 'Choose VAT-registered or Non-VAT' }),
    registeredName: text(TAX_TEXT_LIMITS.registeredName, 'Business name'),
    tin: z
      .string()
      .trim()
      .refine((value) => value === '' || TIN_PATTERN.test(value), {
        message: 'Enter your TIN like 123-456-789 or 123-456-789-00000',
      }),
    tinBranchCode: z
      .string()
      .trim()
      .refine((value) => value === '' || BRANCH_CODE_PATTERN.test(value), {
        message: 'The branch code is 3 to 5 digits, like 000 or 00000',
      }),
    businessAddress: text(TAX_TEXT_LIMITS.businessAddress, 'Address'),
    isBirRegisteredPos: z.boolean(),
    posMin: text(TAX_TEXT_LIMITS.posMin, 'MIN'),
    posSerialNo: text(TAX_TEXT_LIMITS.posSerialNo, 'Serial number'),
    posPtuNo: text(TAX_TEXT_LIMITS.posPtuNo, 'PTU number'),
    enabledKinds: z.array(z.enum(['senior', 'pwd', 'athlete', 'medal_of_valor'])),
    allowSharedTable: z.boolean(),
    approvalRule: z.enum(['never', 'above', 'always']),
    approvalThreshold: z.string().trim(),
    serviceChargeMode: z.enum(['full', 'exempt_share']),
    idPhotoMode: z.enum(['off', 'optional']),
  })
  .superRefine((values, ctx) => {
    const typedBranch = TIN_PATTERN.test(values.tin) ? splitTin(values.tin).branch : ''
    if (typedBranch && values.tinBranchCode && typedBranch !== values.tinBranchCode) {
      ctx.addIssue({
        code: 'custom',
        path: ['tinBranchCode'],
        message: `Your TIN already ends in branch ${typedBranch}. Clear one of them.`,
      })
    }

    if (values.isBirRegisteredPos) {
      if (!values.posMin) {
        ctx.addIssue({ code: 'custom', path: ['posMin'], message: 'Enter the MIN from your Permit To Use' })
      }
      if (!values.posPtuNo) {
        ctx.addIssue({ code: 'custom', path: ['posPtuNo'], message: 'Enter your PTU number' })
      }
    }

    if (values.approvalRule === 'above') {
      const amount = Number(values.approvalThreshold)
      const isValid =
        MONEY_PATTERN.test(values.approvalThreshold) && amount > 0 && amount <= MAX_APPROVAL_THRESHOLD
      if (!isValid) {
        ctx.addIssue({
          code: 'custom',
          path: ['approvalThreshold'],
          message: 'Enter an amount in pesos, like 500',
        })
      }
    }
  })

export type TaxSettingsFormValues = z.input<typeof taxSettingsFormSchema>

/** Field names the form can show an error under. */
export type TaxSettingsField = keyof TaxSettingsFormValues
