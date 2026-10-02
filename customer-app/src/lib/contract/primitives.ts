import { z } from 'zod'

/** Six-digit hex only: the app feeds these straight into native colour props. */
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #RRGGBB colour')

/** Remote media and links the app may open. Plain http and script schemes never reach a phone. */
export const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://'), 'Expected an https URL')

/** Peso amounts as the web stores them. Money maths in the app runs in centavos. */
export const pesoAmountSchema = z.number().finite().nonnegative()

export const isoDateTimeSchema = z.string().datetime({ offset: true })
