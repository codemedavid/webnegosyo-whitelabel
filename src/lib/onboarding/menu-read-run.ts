/**
 * Starting and finishing the in-wizard menu read (see `menu-read.ts`).
 *
 * Starting is a compare-and-swap on the set-up's assets, so two taps (or two
 * tabs) start one read. The read itself runs after the response; its result
 * lands only if the set-up still wants a read of the SAME sources and is still
 * being answered: after submit the build owns the menu, and a late read is
 * dropped (the build reads the menu itself).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { parseMenuWithAi } from '@/lib/menu-import/parse-menu-ai'
import { fetchImageAsDataUrl } from '@/lib/menu-import/fetch-image'
import { findOnboardingById, updateOnboardingAssets, type OnboardingAssets, type StoreOnboarding } from './repository'
import {
  MAX_MENU_READS,
  hasMenuSources,
  menuReadKey,
  menuReadView,
  shouldStartMenuRead,
  type MenuReadView,
} from './menu-read'

/** Under the route's 300s budget, like the build's own read. */
const MENU_READ_DEADLINE_MS = 200_000
/** The read is re-sent on every status poll; keep the stored menu small. */
const MAX_STORED_READ_BYTES = 300_000

export interface MenuReadRequest {
  view: MenuReadView
  /** The read to run after the response; null when none was started. */
  run: (() => Promise<void>) | null
}

function startedAssets(assets: OnboardingAssets, key: string, nowMs: number): OnboardingAssets | null {
  if (!shouldStartMenuRead(assets.menuRead, key, nowMs)) return null
  const starts = assets.menuReadStarts ?? 0
  if (starts >= MAX_MENU_READS) return null
  return {
    ...assets,
    menuRead: { key, status: 'reading', startedAt: new Date(nowMs).toISOString(), parsed: null },
    menuReadStarts: starts + 1,
  }
}

async function finishRead(admin: SupabaseClient, onboardingId: string, key: string, outcome: Pick<NonNullable<OnboardingAssets['menuRead']>, 'status' | 'parsed'>): Promise<void> {
  try {
    await updateOnboardingAssets(admin, onboardingId, (current) => {
      // Only the read we started may land: newer photos make it stale.
      if (current.menuRead?.key !== key || current.menuRead.status !== 'reading') return null
      return { ...current, menuRead: { ...current.menuRead, ...outcome } }
    })
  } catch (error) {
    // Submitted meanwhile: the build reads the menu itself.
    console.warn('[onboarding/menu-read] result dropped', { onboardingId, message: error instanceof Error ? error.message : String(error) })
  }
}

async function readMenu(admin: SupabaseClient, onboardingId: string, key: string, imageUrls: readonly string[], menuText: string): Promise<void> {
  try {
    const images = await Promise.all(imageUrls.map((url) => fetchImageAsDataUrl(url)))
    const parsed = await parseMenuWithAi(
      { text: menuText.trim() || undefined, images },
      { fetchImpl: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(MENU_READ_DEADLINE_MS) }) },
    )
    if (!parsed.ok) throw new Error(parsed.error)
    const isSmall = JSON.stringify(parsed.data).length <= MAX_STORED_READ_BYTES
    await finishRead(admin, onboardingId, key, isSmall ? { status: 'done', parsed: parsed.data } : { status: 'failed', parsed: null })
  } catch (error) {
    console.error('[onboarding/menu-read] read failed', { onboardingId, message: error instanceof Error ? error.message : String(error) })
    await finishRead(admin, onboardingId, key, { status: 'failed', parsed: null })
  }
}

/**
 * Report the read of the set-up's current sources, starting it when there is
 * none yet. Idempotent: the wizard polls this.
 */
export async function requestMenuRead(
  admin: SupabaseClient,
  onboarding: StoreOnboarding,
  menuText: string,
  nowMs: number = Date.now(),
): Promise<MenuReadRequest> {
  const imageUrls = onboarding.assets.menuImageUrls ?? []
  const key = menuReadKey(imageUrls, menuText)
  if (!hasMenuSources(imageUrls, menuText)) return { view: { status: 'idle', dishes: [] }, run: null }

  const started = shouldStartMenuRead(onboarding.assets.menuRead, key, nowMs)
    ? await updateOnboardingAssets(admin, onboarding.id, (current) => {
        // Re-check against the row as it is now: the photos may have changed under us.
        if (menuReadKey(current.menuImageUrls ?? [], menuText) !== key) return null
        return startedAssets(current, key, nowMs)
      })
    : null
  if (started) {
    return { view: { status: 'reading', dishes: [] }, run: () => readMenu(admin, onboarding.id, key, imageUrls, menuText) }
  }

  const latest = await findOnboardingById(admin, onboarding.id)
  const current = latest?.assets ?? onboarding.assets
  const currentKey = menuReadKey(current.menuImageUrls ?? [], menuText)
  return { view: menuReadView(current.menuRead, currentKey, nowMs), run: null }
}
