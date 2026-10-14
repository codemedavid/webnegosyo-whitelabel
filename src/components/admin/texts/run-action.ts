'use client'

import { toast } from 'sonner'
import type { ActionResult } from '@/lib/texts/types'

export const SAVE_FAILED = "Couldn't save. Check your connection and try again."
export const DEMO_READONLY = 'This is a demo store. Nothing is saved or sent.'

/** Runs a Texts server action, toasting its refusal; the value on success, null otherwise. */
export async function runAction<T>(
  call: () => Promise<ActionResult<T>>,
  fallbackError: string = SAVE_FAILED
): Promise<T | null> {
  try {
    const result = await call()
    if (result.ok) return result.value
    toast.error(result.error || fallbackError)
    return null
  } catch {
    toast.error(fallbackError)
    return null
  }
}
