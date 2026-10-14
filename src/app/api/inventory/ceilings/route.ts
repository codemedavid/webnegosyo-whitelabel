import { NextRequest, NextResponse } from 'next/server'
import { getMenuStockAvailability, type OptionStockCeilings } from '@/lib/inventory/menu-ceilings'

/**
 * GET /api/inventory/ceilings?tenantId=…&outletId=…
 *
 * How many of each dish the kitchen can currently make, so a quantity stepper
 * can stop where the shelf does instead of letting a customer discover it at
 * the last screen of checkout.
 *
 * WHY THIS IS UNAUTHENTICATED, AND WHY THAT IS SAFE.
 * A diner has no account, so this cannot be gated on a session — the same
 * position `/api/inventory/customer-order-stock` is in. It is guarded by
 * carrying nothing steerable and returning nothing private: the caller names a
 * tenant and optionally a branch, and what comes back is one integer per dish,
 * which is precisely what the storefront is about to render to that diner
 * anyway — plus, per dish, one integer per recipe-tracked option
 * (`optionCeilings`), so a choice that cannot be made reads as sold out. No
 * ingredient, cost, supplier, recipe or stock quantity crosses this boundary.
 * Untracked dishes are simply absent.
 *
 * Never an error response. A stepper that cannot load its cap falls back to
 * uncapped — exactly how it behaved before this existed — and checkout remains
 * the authoritative refusal either way. A broken menu would be a far worse
 * outcome than an uncapped one.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const tenantId = request.nextUrl.searchParams.get('tenantId')
  const outletId = request.nextUrl.searchParams.get('outletId')

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId is required' }, { status: 400 })
  }

  // A ceiling is stale the moment the next order lands, so nothing may hold
  // onto one. A cached "3 left" outliving its stock is the exact failure this
  // whole feature exists to prevent.
  const headers = { 'Cache-Control': 'no-store' }

  try {
    const { dishes, options } = await getMenuStockAvailability(tenantId, outletId || null)
    return NextResponse.json(
      { ceilings: Object.fromEntries(dishes), optionCeilings: toJsonOptionCeilings(options) },
      { headers },
    )
  } catch (error) {
    console.error('[inventory] Ceilings read failed', tenantId, error)
    return NextResponse.json({ ceilings: {}, optionCeilings: {} }, { headers })
  }
}

function toJsonOptionCeilings(options: OptionStockCeilings): Record<string, Record<string, number>> {
  return Object.fromEntries([...options].map(([menuItemId, byOption]) => [menuItemId, Object.fromEntries(byOption)]))
}
