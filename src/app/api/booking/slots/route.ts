import { NextRequest, NextResponse } from 'next/server'
import { getAvailableSlots } from '@/lib/booking/slots'

export async function GET(request: NextRequest) {
  const dateParam = request.nextUrl.searchParams.get('date')
  if (!dateParam) {
    return NextResponse.json({ error: 'date parameter required' }, { status: 400 })
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
