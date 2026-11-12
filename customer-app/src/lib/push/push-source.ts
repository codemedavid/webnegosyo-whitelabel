import type { AppClient } from '@/lib/api/app-client'
import { appPushTokenResultSchema, type AppPushTokenRegistration } from '@/lib/contract'

/** The store's push-token routes. Prototype builds (no API) remember nothing. */
export interface PushSource {
  register(session: string, registration: AppPushTokenRegistration): Promise<void>
  remove(session: string): Promise<void>
}

export function createLivePush(client: AppClient): PushSource {
  return {
    register: async (session, registration) => {
      await client.send('POST', '/api/app/v1/me/push-token', appPushTokenResultSchema, { body: registration, token: session })
    },
    remove: async (session) => {
      await client.send('DELETE', '/api/app/v1/me/push-token', appPushTokenResultSchema, { token: session })
    },
  }
}

export function createPrototypePush(): PushSource {
  return { register: async () => undefined, remove: async () => undefined }
}
