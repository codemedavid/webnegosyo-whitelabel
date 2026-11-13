'use server'

/**
 * App Studio → Builds: start a store-app build and watch it
 * (plan docs/plans/2026-11-13-customer-app-p9-build-pipeline.md).
 *
 * Starting a build costs EAS build minutes and sends the build to testers,
 * so it takes `customer_apps.edit`; watching takes `customer_apps.view`.
 * Inputs arrive as `unknown` and are parsed here (Server Actions are public
 * POST endpoints whatever the page gate says).
 */
import { z } from 'zod'
import { defineAction } from '@/platform/http/define-action'
import type { Refusal } from '@/platform/http/entry'
import {
  AppBuildError,
  appBuildsDb,
  buildsOverview,
  startBuilds,
  type AppBuildView,
  type AppBuildsOverview,
} from '@/lib/app-builds/service'
import { BUILD_PLATFORMS } from '@/lib/app-builds/status'

export type AppBuildsResult<T> = { ok: true; data: T } | { ok: false; error: string }

const tenantIdSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).transform((id) => id.toLowerCase())
const platformsSchema = z.array(z.enum(BUILD_PLATFORMS)).min(1).max(2).transform((list) => [...new Set(list)])

const refused = (refusal: Refusal): { ok: false; error: string } => ({ ok: false, error: refusal.message })

async function run<T>(work: () => Promise<T>): Promise<AppBuildsResult<T>> {
  try {
    return { ok: true, data: await work() }
  } catch (error) {
    if (error instanceof AppBuildError) return { ok: false, error: error.message }
    console.error('[app-builds] action failed', { message: error instanceof Error ? error.message : String(error) })
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }
}

export const getAppBuildsAction = defineAction({
  auth: { kind: 'superadmin', permission: 'customer_apps.view' },
  args: [z.unknown()],
  onRefusal: refused,
  handler: ({ args: [tenantId] }): Promise<AppBuildsResult<AppBuildsOverview>> => run(async () => {
    const id = tenantIdSchema.safeParse(tenantId)
    if (!id.success) throw new AppBuildError('That store was not found.')
    return buildsOverview(appBuildsDb(), id.data)
  }),
})

export const startAppBuildsAction = defineAction({
  auth: { kind: 'superadmin', permission: 'customer_apps.edit' },
  args: [z.unknown(), z.unknown()],
  onRefusal: refused,
  handler: ({ user, args: [tenantId, platforms] }): Promise<AppBuildsResult<AppBuildView[]>> => run(async () => {
    const id = tenantIdSchema.safeParse(tenantId)
    if (!id.success) throw new AppBuildError('That store was not found.')
    const list = platformsSchema.safeParse(platforms)
    if (!list.success) throw new AppBuildError('Pick iOS, Android or both.')
    return startBuilds(appBuildsDb(), id.data, list.data, user.id)
  }),
})
