import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { verifyTenantPermission } from '@/lib/admin-service'
import { getIngredients } from '@/lib/inventory/ingredients-service'
import { getUnits } from '@/lib/inventory/units-service'
import {
  deleteRecipeForTarget,
  getRecipeForTarget,
  saveRecipeForTarget,
} from '@/lib/inventory/recipes-service'
import { recipeInputSchema } from '@/lib/inventory/schemas'

const nonEmptyId = z.string().trim().min(1)
const tenantSlugSchema = z.string().min(2).regex(/^[a-z0-9-]+$/)

const recipeTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('menu_item'), menuItemId: nonEmptyId }),
  z.object({
    type: z.literal('variation_option'),
    menuItemId: nonEmptyId,
    variationOptionId: nonEmptyId,
  }),
  z.object({ type: z.literal('addon'), menuItemId: nonEmptyId, addonId: nonEmptyId }),
  z.object({
    type: z.literal('modifier_option'),
    menuItemId: nonEmptyId,
    modifierOptionId: nonEmptyId,
  }),
  z.object({ type: z.literal('prep_item'), prepItemId: nonEmptyId }),
])

const saveRequestSchema = z.object({
  tenantId: nonEmptyId,
  tenantSlug: tenantSlugSchema,
  target: recipeTargetSchema,
  input: recipeInputSchema,
})

const deleteRequestSchema = saveRequestSchema.omit({ input: true })

interface ErrorContext {
  operation: 'read' | 'save' | 'clear'
  tenantId?: string
}

function errorResponse(error: unknown, context: ErrorContext) {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: 'Invalid recipe request' }, { status: 400 })
  }

  const message = error instanceof Error ? error.message : 'Recipe request failed'
  const status = message === 'Unauthorized: Not authenticated' ? 401 :
    message.startsWith('Unauthorized:') || message.startsWith('Forbidden:') ? 403 : 500

  if (status === 500) {
    console.error('[inventory] Recipe route failed', context, error)
    try {
      Sentry.captureException(error, {
        tags: {
          area: 'inventory_recipe',
          operation: context.operation,
          ...(context.tenantId ? { tenantId: context.tenantId } : {}),
        },
      })
    } catch (reportError) {
      console.error('[inventory] Failed to report recipe route error to Sentry', reportError)
    }
  }

  return NextResponse.json(
    { error: status === 500 ? 'Recipe request failed' : message },
    { status },
  )
}

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false

  try {
    const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
    const requestHost = forwardedHost || request.headers.get('host') || request.nextUrl.host
    return new URL(origin).host.toLowerCase() === requestHost.toLowerCase()
  } catch {
    return false
  }
}

function rejectCrossOrigin(request: NextRequest): NextResponse | null {
  return isSameOrigin(request)
    ? null
    : NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

/**
 * One abortable read replaces the editor's three route-scoped Server Actions.
 * The permission gate runs before any tenant data is read; the service queries
 * still use the caller's cookie-bound Supabase client and its RLS policies.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  let tenantId: string | undefined
  try {
    tenantId = nonEmptyId.parse(request.nextUrl.searchParams.get('tenantId'))
    const target = recipeTargetSchema.parse(
      JSON.parse(request.nextUrl.searchParams.get('target') ?? ''),
    )

    await verifyTenantPermission(tenantId, 'menu')
    const [ingredients, units, recipe] = await Promise.all([
      getIngredients(tenantId),
      getUnits(tenantId),
      getRecipeForTarget(tenantId, target),
    ])

    return NextResponse.json(
      { success: true, data: { ingredients, units, recipe } },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    const response = errorResponse(error, { operation: 'read', tenantId })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }
}

/**
 * A normal HTTP write is not queued against Next's current route tree, so it
 * cannot be forwarded to a different page worker when the merchant navigates.
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const originError = rejectCrossOrigin(request)
  if (originError) return originError

  let tenantId: string | undefined
  try {
    const parsed = saveRequestSchema.parse(
      await request.json(),
    )
    tenantId = parsed.tenantId
    const { tenantSlug, target, input } = parsed
    await verifyTenantPermission(tenantId, 'menu')
    const data = await saveRecipeForTarget(tenantId, target, input)
    revalidatePath(`/${tenantSlug}/admin/inventory`)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return errorResponse(error, { operation: 'save', tenantId })
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const originError = rejectCrossOrigin(request)
  if (originError) return originError

  let tenantId: string | undefined
  try {
    const parsed = deleteRequestSchema.parse(await request.json())
    tenantId = parsed.tenantId
    const { tenantSlug, target } = parsed
    await verifyTenantPermission(tenantId, 'menu')
    await deleteRecipeForTarget(tenantId, target)
    revalidatePath(`/${tenantSlug}/admin/inventory`)
    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error, { operation: 'clear', tenantId })
  }
}
