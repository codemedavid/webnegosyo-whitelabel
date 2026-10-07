/**
 * Browser calls to /api/onboarding/[token]. Every function resolves to a
 * result object — never throws — so the wizard can show the server's message.
 */

import type { OnboardingAnswers } from '@/lib/onboarding/answers'
import type { OnboardingAssets } from '@/lib/onboarding/repository'
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

export function uploadOnboardingPhoto(token: string, kind: 'logo' | 'menu', file: File): Promise<ApiResult<OnboardingAssets>> {
  const form = new FormData()
  form.append('kind', kind)
  form.append('file', file, file.name || `${kind}.jpg`)
  return call(`${base(token)}/upload`, { method: 'POST', body: form }, (body) => body.assets as OnboardingAssets)
}

export function removeOnboardingPhoto(token: string, kind: 'logo' | 'menu', index = 0): Promise<ApiResult<OnboardingAssets>> {
  return call(
    `${base(token)}/upload`,
    { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, index }) },
    (body) => body.assets as OnboardingAssets,
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
