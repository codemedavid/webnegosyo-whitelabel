import { z } from 'zod'
import { isoDateTimeSchema } from './primitives'

/** One rung of a program's reward ladder, lowest first; the last one resets the card. */
export const appRewardStepSchema = z.object({
  at: z.number().int().positive(),
  label: z.string().min(1),
  emoji: z.string().min(1),
  imageUrl: z.string().nullable(),
  isFinal: z.boolean(),
})

export type AppRewardStep = z.infer<typeof appRewardStepSchema>

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
  /** Absent from older servers; one final rung when the program has no milestones. */
  rewardSteps: z.array(appRewardStepSchema).optional(),
})

export type AppLoyaltyProgram = z.infer<typeof appLoyaltyProgramSchema>

export const appRewardSchema = z.object({
  id: z.string().min(1),
  programName: z.string().min(1),
  label: z.string().min(1),
  expiresAt: isoDateTimeSchema.nullable(),
  branchName: z.string().nullable(),
  emoji: z.string().nullable().optional(),
  /** The menu photo of a free item, when the catalog has one. */
  imageUrl: z.string().nullable().optional(),
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
  /**
   * Whether "Use now" can mint a claim QR (the store's counter can redeem it).
   * False = the reward is shown and the customer asks the cashier.
   */
  claimsAvailable: z.boolean().default(false),
})

export type AppLoyalty = z.infer<typeof appLoyaltySchema>

export const appRewardClaimRequestSchema = z.object({
  rewardId: z.string().uuid(),
})

export type AppRewardClaimRequest = z.infer<typeof appRewardClaimRequestSchema>

/**
 * A single-use reward QR, good for about two minutes: the same token the
 * web rewards page shows and the register's scanner reads.
 */
export const appRewardClaimSchema = z.object({
  token: z.string().regex(/^v1\.[A-Za-z0-9_-]{43}\.[a-f0-9]{64}$/),
  expiresAt: isoDateTimeSchema,
})

export type AppRewardClaim = z.infer<typeof appRewardClaimSchema>
