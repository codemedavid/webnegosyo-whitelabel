import { z } from 'zod'
import { isoDateTimeSchema } from './primitives'

export const appLoyaltyProgramSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  earnMode: z.enum(['stamp', 'points']),
  threshold: z.number().int().positive(),
  /** Can be negative after a reversal; the UI clamps what it draws, not what it says. */
  balance: z.number().int(),
  rewardLabel: z.string().min(1),
  minSpend: z.number().nonnegative().nullable().optional(),
  branchName: z.string().nullable(),
})

export type AppLoyaltyProgram = z.infer<typeof appLoyaltyProgramSchema>

export const appRewardSchema = z.object({
  id: z.string().min(1),
  programName: z.string().min(1),
  label: z.string().min(1),
  expiresAt: isoDateTimeSchema.nullable(),
  branchName: z.string().nullable(),
})

export type AppReward = z.infer<typeof appRewardSchema>

export const APP_ACTIVITY_KINDS = ['earn', 'reverse', 'redeem', 'correction', 'reward_issued', 'reward_expired'] as const

export const appLoyaltyActivitySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(APP_ACTIVITY_KINDS),
  delta: z.number().int(),
  label: z.string().min(1),
  occurredAt: isoDateTimeSchema,
})

export type AppLoyaltyActivity = z.infer<typeof appLoyaltyActivitySchema>

export const appLoyaltySchema = z.object({
  /** `WNLC1.<serial>` — the same code the POS scans from a wallet pass. */
  memberCode: z.string().regex(/^WNLC1\.[A-Za-z0-9_-]{16,64}$/).nullable(),
  programs: z.array(appLoyaltyProgramSchema),
  rewards: z.array(appRewardSchema),
  activity: z.array(appLoyaltyActivitySchema),
})

export type AppLoyalty = z.infer<typeof appLoyaltySchema>
