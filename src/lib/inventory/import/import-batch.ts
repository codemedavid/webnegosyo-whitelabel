/**
 * The shape of one import batch as the browser sends it.
 *
 * Pure zod, shared by the wizard (for its batch size) and the server action
 * (which re-validates everything — the plan the browser built is a proposal).
 */

import { z } from 'zod'
import { ingredientInputSchema } from '@/lib/inventory/schemas'

/**
 * Rows per server call. Small enough that a batch finishes well inside a
 * serverless timeout even when every row records a stock count, and that the
 * progress bar moves; large enough that a 500-row pantry is 20 calls.
 */
export const IMPORT_BATCH_SIZE = 25

export const importRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  existingId: z.string().uuid().nullable(),
  input: ingredientInputSchema.omit({ image_url: true }),
  onHand: z.number().min(0, 'On hand can’t be below zero').nullable(),
})

export const importBatchSchema = z.object({
  /** Branch the stock counts land on. Absent = the importer's own scope. */
  outletId: z.string().uuid().nullable().optional(),
  rows: z.array(importRowSchema).min(1).max(IMPORT_BATCH_SIZE),
})

export type ImportRowInput = z.infer<typeof importRowSchema>
export type ImportBatchInput = z.infer<typeof importBatchSchema>
