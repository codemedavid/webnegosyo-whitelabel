import { z } from 'zod'
import { AppApiError, type AppClient } from '@/lib/api/app-client'
import {
  appOtpRequestResultSchema,
  appOtpVerifyResultSchema,
  appProfileSchema,
  type AppOtpVerifyResult,
  type AppProfile,
} from '@/lib/contract'
import { isPrototypeCodeAccepted } from './code-input'

/**
 * Sign-in as the screens see it. Live: the store's /api/app/v1 auth routes.
 * Prototype (no API URL): codes are not sent and any code but 000000 passes.
 */
export interface AuthSource {
  /** Texts a code; the answer is the same whether or not the number is known. */
  requestCode(phoneE164: string): Promise<{ challengeId: string }>
  /** Wrong, expired or used codes all fail with `unauthorized`. */
  verifyCode(input: { challengeId: string; phoneE164: string; code: string }): Promise<AppOtpVerifyResult>
  getProfile(token: string): Promise<AppProfile>
  updateName(token: string, name: string | null): Promise<AppProfile>
  signOut(token: string): Promise<void>
  deleteAccount(token: string): Promise<void>
}

const okSchema = z.object({}).passthrough()

export function createLiveAuth(client: AppClient): AuthSource {
  return {
    requestCode: (phoneE164) =>
      client.send('POST', '/api/app/v1/auth/otp/request', appOtpRequestResultSchema, { body: { phone: phoneE164 } }),
    verifyCode: ({ challengeId, phoneE164, code }) =>
      client.send('POST', '/api/app/v1/auth/otp/verify', appOtpVerifyResultSchema, { body: { challengeId, phone: phoneE164, code } }),
    getProfile: (token) => client.get('/api/app/v1/me', appProfileSchema, { token }),
    updateName: (token, name) => client.send('PATCH', '/api/app/v1/me', appProfileSchema, { body: { name }, token }),
    signOut: async (token) => {
      await client.send('DELETE', '/api/app/v1/auth/session', okSchema, { token })
    },
    deleteAccount: async (token) => {
      await client.send('DELETE', '/api/app/v1/me', okSchema, { token })
    },
  }
}

const PROTOTYPE_LATENCY_MS = 500
const PROTOTYPE_TOKEN = `cs1.${'p'.repeat(43)}`
const pause = () => new Promise((resolve) => setTimeout(resolve, PROTOTYPE_LATENCY_MS))

/** Fixture builds only. Keeps the profile in memory so the name step and Account edits behave. */
export function createPrototypeAuth(): AuthSource {
  let profile: AppProfile | null = null
  const current = () => {
    if (!profile) throw new AppApiError('unauthorized', 'Please sign in again.')
    return profile
  }
  return {
    requestCode: async () => {
      await pause()
      return { challengeId: '00000000-0000-4000-8000-000000000000' }
    },
    verifyCode: async ({ phoneE164, code }) => {
      await pause()
      if (!isPrototypeCodeAccepted(code)) throw new AppApiError('unauthorized', 'That code isn’t right. Check the text and try again.')
      const isNewCustomer = profile?.phoneE164 !== phoneE164
      profile = isNewCustomer ? { name: null, phoneE164 } : current()
      return { token: PROTOTYPE_TOKEN, isNewCustomer, profile }
    },
    getProfile: async () => current(),
    updateName: async (_token, name) => {
      profile = { ...current(), name: name?.trim() ? name.trim() : null }
      return profile
    },
    signOut: async () => undefined,
    deleteAccount: async () => {
      profile = null
    },
  }
}
