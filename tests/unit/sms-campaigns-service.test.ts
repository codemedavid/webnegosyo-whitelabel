/**
 * Writing and reading SMS campaigns from the provisioning/MCP surface.
 *
 * Creating a campaign here schedules nothing on its own. Sending is done by the
 * merchant's Android handset, which polls for campaigns that have come due and
 * claims the run before texting (`webnegosyo-app/lib/sms/run-orchestrator.ts`).
 * A campaign written by a tool call is therefore inert until a device picks it
 * up — and a DRAFT one never will, which is exactly the safety property the
 * draft default is buying.
 */

import { createSmsCampaign, listSmsCampaignsForProvisioning } from '@/lib/sms-campaigns-service'

function fakeClient(inserted: Record<string, unknown> | null = { id: 'c1' }, error: { message: string } | null = null) {
  const captured: { table?: string; row?: Record<string, unknown> } = {}

  return {
    captured,
    client: {
      from: (table: string) => {
        captured.table = table
        const b: Record<string, unknown> = {}
        Object.assign(b, {
          insert: (row: Record<string, unknown>) => {
            captured.row = row
            return b
          },
          select: () => b,
          eq: () => b,
          order: () => b,
          single: () => Promise.resolve({ data: inserted, error }),
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ data: inserted ? [inserted] : [], error }),
        })
        return b
      },
    },
  }
}

const VALID = {
  name: 'Win-back',
  message_template: 'Hi {{firstName}}, come back for 10% off.',
  schedule_kind: 'one_off',
  schedule_date: '2026-09-01',
}

const ctxOf = (client: unknown) => ({ client: client as never })

describe('createSmsCampaign', () => {
  it('writes the campaign to sms_campaigns scoped to the tenant', async () => {
    // Arrange
    const { client, captured } = fakeClient()

    // Act
    await createSmsCampaign('t1', VALID, ctxOf(client))

    // Assert
    expect(captured.table).toBe('sms_campaigns')
    expect(captured.row).toMatchObject({ tenant_id: 't1', name: 'Win-back', status: 'draft' })
  })

  it('rejects an unfireable schedule before it reaches the database', async () => {
    const { client, captured } = fakeClient()

    await expect(
      createSmsCampaign('t1', { ...VALID, schedule_kind: 'weekly', schedule_date: undefined }, ctxOf(client)),
    ).rejects.toThrow(/schedule_weekdays/i)
    expect(captured.row).toBeUndefined()
  })

  it('tells the caller the campaign will not send until a device picks it up', async () => {
    const result = await createSmsCampaign('t1', VALID, ctxOf(fakeClient().client))

    expect((result as { notice?: string }).notice).toMatch(/draft|activate|device|handset/i)
  })

  it('says nothing misleading once the caller explicitly activates it', async () => {
    const result = await createSmsCampaign('t1', { ...VALID, status: 'active' }, ctxOf(fakeClient().client))

    expect((result as { notice?: string }).notice).toMatch(/device|handset|android/i)
  })

  it('surfaces a database failure rather than reporting a phantom campaign', async () => {
    const { client } = fakeClient(null, { message: 'constraint violated' })

    await expect(createSmsCampaign('t1', VALID, ctxOf(client))).rejects.toThrow(/constraint violated/i)
  })
})

describe('listSmsCampaignsForProvisioning', () => {
  it('reads the tenant\'s campaigns', async () => {
    const { client, captured } = fakeClient({ id: 'c1', name: 'Win-back', status: 'draft' })

    const result = await listSmsCampaignsForProvisioning('t1', ctxOf(client))

    expect(captured.table).toBe('sms_campaigns')
    expect(result[0]).toMatchObject({ name: 'Win-back' })
  })

  it('throws on a failed read instead of returning an empty list', async () => {
    // An empty list reads as "this tenant runs no campaigns", which would invite
    // the caller to create a duplicate of one that already exists.
    const { client } = fakeClient(null, { message: 'permission denied' })

    await expect(listSmsCampaignsForProvisioning('t1', ctxOf(client))).rejects.toThrow(/permission denied/i)
  })
})
