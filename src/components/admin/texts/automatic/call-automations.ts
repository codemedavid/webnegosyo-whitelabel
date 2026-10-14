'use client'

import { automationsAction } from '@/app/actions/texts'
import type { ActionResult } from '@/lib/texts/types'

/**
 * The app's POST /api/sms/automations body, minus tenantId, through the
 * Server Action. The shapes are the app's (webnegosyo-app/lib/sms-automations/api.ts).
 */
export async function callAutomations<T>(tenantId: string, body: Record<string, unknown>): Promise<ActionResult<T>> {
  try {
    return (await automationsAction(tenantId, body as Parameters<typeof automationsAction>[1])) as unknown as ActionResult<T>
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again.' }
  }
}

export interface DeliveryOutlookValue {
  waiting: number
  sentToday: number
  dailyLimit: number
  finishAt: string | null
}

export interface PreviewValue {
  audience: { withPhone: number; textable: number }
  now: { qualifying: number; queued: number; skipped: Partial<Record<string, number>>; sample: string[] } | null
  justQualified: number
  sampleText: string | null
  outlook: DeliveryOutlookValue
}

export interface BacklogValue {
  queued: number
  outlook: DeliveryOutlookValue
}
