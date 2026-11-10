import { NextRequest, NextResponse } from 'next/server'
import { getAvailableSlots } from '@/lib/booking/slots'
import { refuseOverIpLimit } from '@/lib/http/rate-limit-guard'

const SLOTS_IP_LIMIT = { limit: 60, windowSec: 60 }
const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: NextRequest) {
  const overLimit = await refuseOverIpLimit(request, 'booking-slots', SLOTS_IP_LIMIT)
  if (overLimit) return overLimit

  const dateParam = request.nextUrl.searchParams.get('date')
  if (!dateParam) {
    return NextResponse.json({ error: 'date parameter required' }, { status: 400 })
  }
  if (!DATE_PARAM.test(dateParam)) {
    return NextResponse.json({ error: 'invalid date' }, { status: 400 })
  }
  const date = new Date(dateParam + 'T00:00:00Z')
  if (isNaN(date.getTime())) {
    return NextResponse.json({ error: 'invalid date' }, { status: 400 })
  }
  try {
    const slots = await getAvailableSlots(date)
    return NextResponse.json({ slots })
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
