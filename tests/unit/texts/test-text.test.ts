import { countSmsSegments } from '@/lib/sms-automations/template'
import { testTextBody, testTextInputSchema, testTextView, type TestTextState } from '@/lib/texts/test-text'

const NOW = Date.parse('2026-10-29T07:12:00Z') // 3:12 PM Manila

function state(overrides: Partial<TestTextState> = {}): TestTextState {
  return {
    id: 't1', status: 'queued', error: null, createdAt: new Date(NOW - 5_000).toISOString(), sentAt: null,
    phoneName: null, quietUntil: null, ...overrides,
  }
}

describe('testTextInputSchema', () => {
  test('takes a local PH mobile number and stores it as E.164', () => {
    expect(testTextInputSchema.parse({ phone: '0917 123 4567' })).toEqual({ phone: '+639171234567' })
  })

  test('refuses a landline or a foreign number with a plain message', () => {
    const result = testTextInputSchema.safeParse({ phone: '02 8123 4567' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/Philippine mobile number/)
  })
})

describe('testTextBody', () => {
  test('names the store and stays one GSM-7 part', () => {
    const body = testTextBody('Kape ni Juan')
    expect(body).toBe('Test text from Kape ni Juan via SmartMenu: your sending phone works.')
    expect(countSmsSegments(body)).toMatchObject({ encoding: 'GSM7', segments: 1 })
  })

  test('leaves out a store name the SIM would have to send as Unicode', () => {
    expect(testTextBody('咖啡店 ☕')).toBe('Test text via SmartMenu: your sending phone works.')
    expect(testTextBody(null)).toBe('Test text via SmartMenu: your sending phone works.')
  })

  test('keeps a very long store name to one part', () => {
    expect(countSmsSegments(testTextBody('A'.repeat(200))).segments).toBe(1)
  })
})

describe('testTextView', () => {
  test('sent names the phone and the time', () => {
    const view = testTextView(state({ status: 'sent', phoneName: 'Infinix X6840', sentAt: '2026-10-29T07:12:00Z' }), NOW)
    expect(view).toMatchObject({ tone: 'ok', title: 'Sent by Infinix X6840 at 3:12 PM', isOpen: false })
  })

  test('a SIM failure says what to fix', () => {
    const view = testTextView(state({ status: 'failed', error: 'no_service', phoneName: 'Infinix X6840' }), NOW)
    expect(view.tone).toBe('bad')
    expect(view.title).toBe("Infinix X6840 couldn't send it")
    expect(view.body).toMatch(/No mobile signal/)
  })

  test('an unknown failure code still gives advice', () => {
    expect(testTextView(state({ status: 'failed', error: 'weird' }), NOW).body).toMatch(/signal and load/)
  })

  test('waiting long asks whether the gateway is on', () => {
    const view = testTextView(state({ createdAt: new Date(NOW - 90_000).toISOString() }), NOW)
    expect(view).toMatchObject({ tone: 'waiting', title: "The phone hasn't picked it up yet", isOpen: true })
  })

  test('quiet hours say when it will go', () => {
    const view = testTextView(state({ quietUntil: '2026-10-30T00:00:00Z' }), NOW)
    expect(view.title).toBe('Waiting for quiet hours to end')
    expect(view.body).toMatch(/8:00 AM/)
  })

  test('expired tells the owner to open the app', () => {
    expect(testTextView(state({ status: 'expired' }), NOW)).toMatchObject({ tone: 'bad', isOpen: false })
  })
})
