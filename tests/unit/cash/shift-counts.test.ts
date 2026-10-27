import { readCountAttempts } from '@/lib/cash/shift-counts'
import { fakeSupabaseTables } from '../../fixtures/fake-supabase-tables'

describe('readCountAttempts', () => {
  it('gives each shift its highest attempt (2 = recounted)', async () => {
    const { client } = fakeSupabaseTables({
      shift_counts: [
        { shift_id: 'a', attempt: 1 },
        { shift_id: 'a', attempt: 2 },
        { shift_id: 'b', attempt: 1 },
        { shift_id: 'other', attempt: 1 },
      ],
    })

    const attempts = await readCountAttempts(client, ['a', 'b', 'c'])

    expect(attempts && Object.fromEntries(attempts)).toEqual({ a: 2, b: 1 })
  })

  it('is null ("not known"), never zero counts, when the read fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const { client } = fakeSupabaseTables({}, { shift_counts: 'relation "shift_counts" does not exist' })

    expect(await readCountAttempts(client, ['a'])).toBeNull()
    errorSpy.mockRestore()
  })

  it('reads nothing for no shifts', async () => {
    const { client, seen } = fakeSupabaseTables({ shift_counts: [] })

    expect(await readCountAttempts(client, [])).toEqual(new Map())
    expect(seen).toHaveLength(0)
  })
})
