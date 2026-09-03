import { NextRequest, NextResponse } from 'next/server'
import { getPresellCalendar } from '@/lib/presell/calendar-read'

/**
 * GET /api/presell/availability?tenantId=…&menuItemId=…
 *
 * Remaining presell stock per upcoming date for one dish, so the calendar can
 * show "3 left" on the 24th and grey out the 25th before the customer commits.
 *
 * Unauthenticated for the same reason `/api/inventory/ceilings` is: a diner
 * has no account to gate on, the request carries nothing steerable, and the
 * response is exactly what the storefront is about to render. Allocation and
 * sold figures never cross this boundary — only the remainder.
 *
 * Never an error response — but unlike ceilings, an unreadable calendar is
 * EMPTY, not unlimited. For a presell dish, no dates means nothing sellable;
 * checkout stays the authoritative refusal either way.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const tenantId = request.nextUrl.searchParams.get('tenantId')
  const menuItemId = request.nextUrl.searchParams.get('menuItemId')

  if (!tenantId || !menuItemId) {
    return NextResponse.json({ error: 'tenantId and menuItemId are required' }, { status: 400 })
  }

  // A remainder is stale the moment the next order lands.
  const headers = { 'Cache-Control': 'no-store' }

  try {
    const calendar = await getPresellCalendar(tenantId, menuItemId)
    return NextResponse.json({ calendar: Object.fromEntries(calendar) }, { headers })
  } catch (error) {
    console.error('[presell] Calendar read failed', tenantId, menuItemId, error)
    return NextResponse.json({ calendar: {} }, { headers })
  }
}
