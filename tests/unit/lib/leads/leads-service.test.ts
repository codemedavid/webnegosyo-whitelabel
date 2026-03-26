import { describe, test, expect, beforeEach } from '@jest/globals'

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js
//
// Jest hoists jest.mock() calls before variable declarations, so we CANNOT
// reference module-scope variables inside the factory. Instead we use
// jest.requireMock() after the fact to retrieve and configure the mock.
// ---------------------------------------------------------------------------

jest.mock('@supabase/supabase-js', () => {
  // Build a self-referential fluent chain inside the factory.
  // All methods return the chain object; we'll replace per-test below.
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'insert', 'update', 'eq', 'neq', 'or', 'order', 'range', 'single']
  for (const m of methods) {
    chain[m] = jest.fn().mockReturnValue(chain)
  }
  const from = jest.fn().mockReturnValue(chain)
  const client = { from }
  return {
    createClient: jest.fn(() => client),
    __chain: chain,
    __from: from,
    __client: client,
  }
})

// Access the mock internals via requireMock so we can configure per-test.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseMock = jest.requireMock('@supabase/supabase-js') as any
const mockChain: Record<string, jest.Mock> = supabaseMock.__chain
const mockFrom: jest.Mock = supabaseMock.__from

// Now import the service AFTER mocks are registered.
import {
  createLead,
  updateLeadStatus,
  getLeads,
  getLeadById,
  addNote,
  getLeadNotes,
  getLeadHistory,
  convertToTenant,
} from '@/lib/leads/leads-service'
import type { Lead, LeadNote, LeadStatusHistoryEntry } from '@/lib/leads/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    name: 'Alice',
    email: 'alice@example.com',
    phone: '09171234567',
    booking_date: '2026-04-01',
    booking_time: '10:00',
    status: 'new',
    source: 'landing_page',
    converted_tenant_id: null,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    ...overrides,
  }
}

const chainMethods = ['select', 'insert', 'update', 'eq', 'neq', 'or', 'order', 'range', 'single']

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks()
  // After clearAllMocks(), re-wire all chain methods to return chain again.
  for (const m of chainMethods) {
    mockChain[m].mockReturnValue(mockChain)
  }
  mockFrom.mockReturnValue(mockChain)
})

// ---------------------------------------------------------------------------
// createLead
// ---------------------------------------------------------------------------
describe('createLead', () => {
  test('happy path — returns inserted lead', async () => {
    const lead = makeLead()
    // Chain: from('leads').insert({}).select().single()
    mockChain['single'].mockResolvedValueOnce({ data: lead, error: null })

    const result = await createLead({
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      booking_date: lead.booking_date,
      booking_time: lead.booking_time,
      source: lead.source,
    })

    expect(result.error).toBeNull()
    expect(result.data).toEqual(lead)
    expect(mockFrom).toHaveBeenCalledWith('leads')
    expect(mockChain['insert']).toHaveBeenCalled()
    expect(mockChain['select']).toHaveBeenCalled()
    expect(mockChain['single']).toHaveBeenCalled()
  })

  test('slot_taken — returns error string when unique violation (code 23505)', async () => {
    mockChain['single'].mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate key value' },
    })

    const result = await createLead({
      name: 'Bob',
      email: 'bob@example.com',
      phone: '09170000000',
      booking_date: '2026-04-01',
      booking_time: '10:00',
      source: 'landing_page',
    })

    expect(result.data).toBeNull()
    expect(result.error).toBe('slot_taken')
  })

  test('server_error — returns error string for generic DB errors', async () => {
    mockChain['single'].mockResolvedValueOnce({
      data: null,
      error: { code: '500', message: 'internal server error' },
    })

    const result = await createLead({
      name: 'Carol',
      email: 'carol@example.com',
      phone: '09170000001',
      booking_date: '2026-04-02',
      booking_time: '11:00',
      source: 'landing_page',
    })

    expect(result.data).toBeNull()
    expect(result.error).toBe('server_error')
  })
})

// ---------------------------------------------------------------------------
// updateLeadStatus
// ---------------------------------------------------------------------------
describe('updateLeadStatus', () => {
  test('happy path — updates status and inserts history entry', async () => {
    // Chain 1: from('leads').update({}).eq('id', leadId) — eq() is terminal
    // Chain 2: from('lead_status_history').insert({}) — insert() is terminal
    mockChain['eq'].mockResolvedValueOnce({ error: null })
    mockChain['insert'].mockResolvedValueOnce({ error: null })

    const result = await updateLeadStatus(
      'lead-1',
      'new',
      'contacted',
      'admin-user',
      'Called and left voicemail'
    )

    expect(result.error).toBeNull()
    expect(mockFrom).toHaveBeenCalledWith('leads')
    expect(mockFrom).toHaveBeenCalledWith('lead_status_history')
    expect(mockChain['update']).toHaveBeenCalled()
    expect(mockChain['insert']).toHaveBeenCalled()
  })

  test('propagates DB error when lead update fails', async () => {
    const dbError = { message: 'update failed' }
    mockChain['eq'].mockResolvedValueOnce({ error: dbError })

    const result = await updateLeadStatus('lead-1', 'new', 'contacted')

    expect(result.error).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// getLeads
// ---------------------------------------------------------------------------
describe('getLeads', () => {
  test('returns list of leads with count', async () => {
    const leads = [makeLead(), makeLead({ id: 'lead-2', name: 'Bob' })]
    // Chain: from('leads').select('*', {count:'exact'}).order(...).range(...)
    mockChain['range'].mockResolvedValueOnce({ data: leads, count: 2, error: null })

    const result = await getLeads({ page: 1, pageSize: 10 })

    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(2)
    expect(result.count).toBe(2)
    expect(mockFrom).toHaveBeenCalledWith('leads')
  })

  test('applies status filter when provided', async () => {
    mockChain['range'].mockResolvedValueOnce({ data: [], count: 0, error: null })

    await getLeads({ status: 'new' })

    expect(mockChain['eq']).toHaveBeenCalledWith('status', 'new')
  })

  test('applies search filter when provided', async () => {
    mockChain['range'].mockResolvedValueOnce({ data: [], count: 0, error: null })

    await getLeads({ search: 'alice' })

    expect(mockChain['or']).toHaveBeenCalledWith(
      expect.stringContaining('alice')
    )
  })
})

// ---------------------------------------------------------------------------
// getLeadById
// ---------------------------------------------------------------------------
describe('getLeadById', () => {
  test('returns single lead by id', async () => {
    const lead = makeLead()
    // Chain: from('leads').select('*').eq('id', id).single()
    mockChain['single'].mockResolvedValueOnce({ data: lead, error: null })

    const result = await getLeadById('lead-1')

    expect(result.error).toBeNull()
    expect(result.data).toEqual(lead)
    expect(mockChain['eq']).toHaveBeenCalledWith('id', 'lead-1')
    expect(mockChain['single']).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// addNote
// ---------------------------------------------------------------------------
describe('addNote', () => {
  test('inserts a note and returns it', async () => {
    const note: LeadNote = {
      id: 'note-1',
      lead_id: 'lead-1',
      note: 'Called, no answer.',
      created_by: 'admin-user',
      created_at: '2026-04-01T09:00:00Z',
    }
    // Chain: from('lead_notes').insert({}).select().single()
    mockChain['single'].mockResolvedValueOnce({ data: note, error: null })

    const result = await addNote('lead-1', 'Called, no answer.', 'admin-user')

    expect(result.error).toBeNull()
    expect(result.data).toEqual(note)
    expect(mockFrom).toHaveBeenCalledWith('lead_notes')
  })
})

// ---------------------------------------------------------------------------
// getLeadNotes
// ---------------------------------------------------------------------------
describe('getLeadNotes', () => {
  test('returns notes ordered by created_at DESC', async () => {
    const notes: LeadNote[] = [
      { id: 'n2', lead_id: 'lead-1', note: 'Second', created_by: null, created_at: '2026-04-02T00:00:00Z' },
      { id: 'n1', lead_id: 'lead-1', note: 'First', created_by: null, created_at: '2026-04-01T00:00:00Z' },
    ]
    // Chain: from('lead_notes').select('*').eq('lead_id', id).order('created_at', {ascending:false})
    mockChain['order'].mockResolvedValueOnce({ data: notes, error: null })

    const result = await getLeadNotes('lead-1')

    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(2)
    expect(mockChain['eq']).toHaveBeenCalledWith('lead_id', 'lead-1')
    expect(mockChain['order']).toHaveBeenCalledWith('created_at', { ascending: false })
  })
})

// ---------------------------------------------------------------------------
// getLeadHistory
// ---------------------------------------------------------------------------
describe('getLeadHistory', () => {
  test('returns history ordered by created_at ASC', async () => {
    const history: LeadStatusHistoryEntry[] = [
      {
        id: 'h1',
        lead_id: 'lead-1',
        old_status: null,
        new_status: 'new',
        changed_by: null,
        note: null,
        created_at: '2026-04-01T00:00:00Z',
      },
    ]
    // Chain: from('lead_status_history').select('*').eq('lead_id', id).order('created_at', {ascending:true})
    mockChain['order'].mockResolvedValueOnce({ data: history, error: null })

    const result = await getLeadHistory('lead-1')

    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(1)
    expect(mockChain['order']).toHaveBeenCalledWith('created_at', { ascending: true })
  })
})

// ---------------------------------------------------------------------------
// convertToTenant
// ---------------------------------------------------------------------------
describe('convertToTenant', () => {
  test('happy path — fetches lead, updates to converted, records history', async () => {
    const lead = makeLead({ status: 'qualified' })

    // Call sequence inside convertToTenant:
    // 1. getLeadById → from('leads').select().eq().single()
    //    eq() returns mockChain (default), single() resolves lead
    mockChain['single'].mockResolvedValueOnce({ data: lead, error: null })

    // 2. update lead → from('leads').update().eq('id', leadId)
    //    eq() must now resolve (not return chain).
    //    We prime a second call on eq:
    mockChain['eq']
      .mockReturnValueOnce(mockChain)     // first eq call (inside getLeadById → select.eq) returns chain
      .mockResolvedValueOnce({ error: null }) // second eq call (update.eq) resolves

    // 3. insert history → from('lead_status_history').insert()
    mockChain['insert'].mockResolvedValueOnce({ error: null })

    const result = await convertToTenant('lead-1', 'tenant-123', 'admin-user')

    expect(result.error).toBeNull()
    expect(mockFrom).toHaveBeenCalledWith('leads')
    expect(mockFrom).toHaveBeenCalledWith('lead_status_history')
  })

  test('returns error when lead fetch fails', async () => {
    // getLeadById path: .select().eq().single() — eq returns chain, single resolves error
    mockChain['eq'].mockReturnValueOnce(mockChain) // eq inside getLeadById returns chain
    mockChain['single'].mockResolvedValueOnce({
      data: null,
      error: { message: 'not found' },
    })

    const result = await convertToTenant('bad-id', 'tenant-123')

    expect(result.error).toBeTruthy()
  })
})
