import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAssistantAccess } from '@/lib/assistant/access'
import { HISTORY_LOAD_LIMIT } from '@/lib/assistant/config'
import { listConversations, loadMessages, openConversation } from '@/lib/assistant/store'
import { loadActionStatuses } from '@/lib/assistant/actions/store'
import { withActionStatuses } from '@/lib/assistant/actions/status'
import { withRequestBearer } from '@/lib/supabase/bearer-session'

/**
 * GET /api/assistant/conversations?tenantId=…        — this person's recent chats
 * GET /api/assistant/conversations?tenantId=…&id=…   — one chat's messages
 *
 * Only ever the caller's own conversations in this store; anyone else's id
 * reads as not found. Reopened proposal cards carry their current outcome.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const querySchema = z.object({ tenantId: z.string().uuid(), id: z.string().uuid().nullable() })
const NO_STORE = { 'Cache-Control': 'private, no-store' }

export function GET(request: NextRequest): Promise<NextResponse> {
  return withRequestBearer(request, () => handleList(request))
}

async function handleList(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams
  const parsed = querySchema.safeParse({ tenantId: params.get('tenantId'), id: params.get('id') })
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: NO_STORE })

  const access = await resolveAssistantAccess(parsed.data.tenantId)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status, headers: NO_STORE })
  const { caller, store } = access

  if (!parsed.data.id) {
    return NextResponse.json({ conversations: await listConversations(store.id, caller.userId) }, { headers: NO_STORE })
  }

  const conversation = await openConversation(store.id, caller.userId, parsed.data.id, '')
  if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404, headers: NO_STORE })
  const [messages, statuses] = await Promise.all([
    loadMessages(conversation.id, HISTORY_LOAD_LIMIT),
    loadActionStatuses(conversation.id),
  ])
  return NextResponse.json({ messages: withActionStatuses(messages, statuses) }, { headers: NO_STORE })
}
