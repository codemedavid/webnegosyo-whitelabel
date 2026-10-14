import { withoutHeroDuplicates } from '@/lib/texts/attention'
import type { AttentionItem } from '@/lib/texts/types'

const item = (kind: AttentionItem['kind']): AttentionItem => ({ id: kind, kind, severity: 'urgent', text: kind, action: { label: 'x', href: '?phones=1' } })
const ITEMS = [item('waiting_no_phone'), item('starts_soon_offline'), item('failure_spike')]

describe('withoutHeroDuplicates', () => {
  test('an offline or missing phone is said once, by the hero', () => {
    expect(withoutHeroDuplicates(ITEMS, 'offline').map((i) => i.kind)).toEqual(['failure_spike'])
    expect(withoutHeroDuplicates(ITEMS, 'none').map((i) => i.kind)).toEqual(['failure_spike'])
  })

  test('other states keep every row', () => {
    expect(withoutHeroDuplicates(ITEMS, 'ready')).toHaveLength(3)
  })
})
