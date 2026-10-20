import type { NextRequest } from 'next/server'
import { handleSmsAutomations } from '@/lib/sms-automations/api/http'

export const maxDuration = 30

export async function POST(request: NextRequest) {
  return handleSmsAutomations(request)
}
