/**
 * Merged is not applied. Every migration file states whether it is live on the
 * platform database in supabase/migration-status.json, so "is this live?" is a
 * lookup instead of a memory. This test keeps the ledger complete; it does not
 * talk to a database (the ledger is updated by whoever applies and probes).
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

interface WaitingEntry {
  status: string
  gate?: string
  note?: string
  checkedOn?: string
  arrivesWith?: string
}

interface Ledger {
  applied: string[]
  notApplied: Record<string, WaitingEntry>
  expected?: Record<string, WaitingEntry>
}

const ROOT = path.resolve(__dirname, '../../..')
const ledger: Ledger = JSON.parse(readFileSync(path.join(ROOT, 'supabase/migration-status.json'), 'utf8'))
const files = readdirSync(path.join(ROOT, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .sort()

const WAITING_STATUSES = ['held', 'pending', 'partial', 'superseded']
const expected = ledger.expected ?? {}

describe('supabase/migration-status.json', () => {
  it('gives every migration file a status', () => {
    const declared = new Set([...ledger.applied, ...Object.keys(ledger.notApplied), ...Object.keys(expected)])
    const undeclared = files.filter((name) => !declared.has(name))
    // A new migration: add it to `applied` once it is applied AND probed live,
    // otherwise to `notApplied` with the condition it is waiting for.
    expect(undeclared).toEqual([])
  })

  it('lists each file once', () => {
    const names = [...ledger.applied, ...Object.keys(ledger.notApplied)]
    const repeated = names.filter((name, index) => names.indexOf(name) !== index)
    expect(repeated).toEqual([])
    expect(Object.keys(expected).filter((name) => names.includes(name))).toEqual([])
  })

  it('lists only files that exist (files expected from an open branch aside)', () => {
    const onDisk = new Set(files)
    const missing = [...ledger.applied, ...Object.keys(ledger.notApplied)].filter((name) => !onDisk.has(name))
    expect(missing).toEqual([])
  })

  it('keeps `applied` sorted, so two branches adding a file rarely conflict', () => {
    expect(ledger.applied).toEqual([...ledger.applied].sort())
  })

  it('says what each waiting migration is waiting for, and when that was last checked', () => {
    for (const [name, entry] of Object.entries(ledger.notApplied)) {
      expect({ name, status: WAITING_STATUSES.includes(entry.status) }).toEqual({ name, status: true })
      expect({ name, gate: (entry.gate ?? '').length > 20 }).toEqual({ name, gate: true })
      expect({ name, checkedOn: /^\d{4}-\d{2}-\d{2}$/.test(entry.checkedOn ?? '') }).toEqual({ name, checkedOn: true })
    }
    for (const [name, entry] of Object.entries(expected)) {
      expect({ name, status: [...WAITING_STATUSES, 'applied'].includes(entry.status) }).toEqual({ name, status: true })
      expect({ name, arrivesWith: (entry.arrivesWith ?? '').length > 0 }).toEqual({ name, arrivesWith: true })
    }
  })
})
