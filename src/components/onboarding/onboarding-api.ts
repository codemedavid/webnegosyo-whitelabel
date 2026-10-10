/**
 * Browser calls to /api/onboarding/[token]. Every function resolves to a
 * result object — never throws — so the wizard can show the server's message.
 */

import type { OnboardingAnswers } from '@/lib/onboarding/answers'
import type { PublicOnboardingAssets } from '@/lib/onboarding/repository'
import type { MenuReadView } from '@/lib/onboarding/menu-read'
import type { LaunchComboView } from '@/lib/onboarding/launch-offers'
import type { OnboardingView } from '@/lib/onboarding/view'

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string }

const CONNECTION_ERROR = 'Connection problem. Check your internet and try again.'

async function call<T>(input: string, init: RequestInit, pick: (body: Record<string, unknown>) => T): Promise<ApiResult<T>> {
  try {
    const response = await fetch(input, { ...init, cache: 'no-store' })
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok) return { ok: false, error: typeof body.error === 'string' ? body.error : CONNECTION_ERROR }
    return { ok: true, data: pick(body) }
  } catch {
    return { ok: false, error: CONNECTION_ERROR }
  }
}

const base = (token: string) => `/api/onboarding/${encodeURIComponent(token)}`

export function fetchOnboardingView(token: string): Promise<ApiResult<OnboardingView>> {
  return call(base(token), { method: 'GET' }, (body) => body.view as OnboardingView)
}

export function uploadOnboardingPhoto(token: string, kind: 'logo' | 'menu', file: File): Promise<ApiResult<PublicOnboardingAssets>> {
  const form = new FormData()
  form.append('kind', kind)
  form.append('file', file, file.name || `${kind}.jpg`)
  return call(`${base(token)}/upload`, { method: 'POST', body: form }, (body) => body.assets as PublicOnboardingAssets)
}

export function removeOnboardingPhoto(token: string, kind: 'logo' | 'menu', index = 0): Promise<ApiResult<PublicOnboardingAssets>> {
  return call(
    `${base(token)}/upload`,
    { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, index }) },
    (body) => body.assets as PublicOnboardingAssets,
  )
}

export function submitOnboarding(token: string, answers: OnboardingAnswers, ownerPassword: string): Promise<ApiResult<{ slug: string }>> {
  return call(
    base(token),
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers, ownerPassword }) },
    (body) => ({ slug: String(body.slug ?? '') }),
  )
}

export function retryOnboarding(token: string): Promise<ApiResult<true>> {
  return call(
    base(token),
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'retry' }) },
    () => true as const,
  )
}

/** "Go live" — opens the paid, built store to customers. */
export function launchOnboardingStore(token: string): Promise<ApiResult<true>> {
  return call(
    base(token),
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'launch' }) },
    () => true as const,
  )
}

/**
 * Sign the new owner in with the password they just chose, so "Open my
 * dashboard" lands inside instead of on a login form. Best effort: a refusal
 * only means they log in by hand later.
 */
export async function signInNewOwner(email: string, password: string): Promise<boolean> {
  try {
    const { createClient } = await import('@/lib/supabase/client')
    const { error } = await createClient().auth.signInWithPassword({ email, password })
    return !error
  } catch {
    return false
  }
}

/** Report (and the first time, start) the read of the uploaded menu photos + this text. */
export function requestMenuRead(token: string, menuText: string): Promise<ApiResult<MenuReadView>> {
  return call(
    `${base(token)}/menu-read`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ menuText }) },
    (body) => body.read as MenuReadView,
  )
}

export function fetchLaunchCombos(token: string): Promise<ApiResult<LaunchComboView[]>> {
  return call(`${base(token)}/launch-offers`, { method: 'GET' }, (body) => (body.combos ?? []) as LaunchComboView[])
}

export function decideLaunchCombo(
  token: string,
  proposalId: string,
  decision: 'keep' | 'skip',
): Promise<ApiResult<{ outcome: 'kept' | 'skipped' | 'needs-edit'; combos: LaunchComboView[] }>> {
  return call(
    `${base(token)}/launch-offers`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposalId, decision }) },
    (body) => ({ outcome: body.outcome as 'kept' | 'skipped' | 'needs-edit', combos: (body.combos ?? []) as LaunchComboView[] }),
  )
}

/** Fire-and-forget funnel beacon (a fixed event name, never an answer). */
export function trackOnboardingEvent(token: string, event: string): void {
  try {
    void fetch(`${base(token)}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event }),
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    // Measurement never breaks the set-up.
  }
}
