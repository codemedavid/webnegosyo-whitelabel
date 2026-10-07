/** @jest-environment node */
/**
 * The owner's message id comes from the client, so saving it must never
 * overwrite a stored message that already has that id (an earlier answer).
 */
jest.mock('server-only', () => ({}))

const mockUpsert = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ upsert: (...args: unknown[]) => mockUpsert(...args) }) }),
}))

const TENANT = '11111111-1111-4111-8111-111111111111'
const CONVERSATION = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  mockUpsert.mockReset().mockResolvedValue({ error: null })
})

test('a user message with a repeated id is ignored, never written over a stored one', async () => {
  const { saveMessage } = await import('@/lib/assistant/store')

  await saveMessage(TENANT, CONVERSATION, { id: 'msg-earlier-answer', role: 'user', parts: [{ type: 'text', text: 'hi' }] })

  expect(mockUpsert.mock.calls[0][1]).toEqual({ onConflict: 'conversation_id,message_id', ignoreDuplicates: true })
})

test('the assistant answer (a server-made id) still upserts', async () => {
  const { saveMessage } = await import('@/lib/assistant/store')

  await saveMessage(TENANT, CONVERSATION, { id: 'msg-server', role: 'assistant', parts: [] })

  expect(mockUpsert.mock.calls[0][1]).toEqual({ onConflict: 'conversation_id,message_id', ignoreDuplicates: false })
})
