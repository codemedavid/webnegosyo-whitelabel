import {
  CAMPAIGN_VARIABLES,
  firstEmoji,
  hasLink,
  insertVariable,
  messageProblem,
  removeEmoji,
  renderSample,
  segmentMeter,
  unknownVariables,
} from '@/lib/texts/view/message'

describe('link detection', () => {
  test.each([
    ['Order at https://lola.ph', true],
    ['see www.lola.com', true],
    ['lola.com/menu', true],
    ['tap bit.ly/abc', true],
    ['tinyurl.com/x', true],
    ['See you at Lola’s.', false],
    ['Order 2 pcs. Come by!', false],
  ])('%s → %s', (text, expected) => {
    expect(hasLink(text)).toBe(expected)
  })
})

describe('emoji', () => {
  test('finds the first character that is not plain text', () => {
    expect(firstEmoji('Hi 😊 there')).toBe('😊')
    expect(firstEmoji('Hi there')).toBeNull()
  })

  test('removeEmoji keeps the words, fixes curly quotes and pesos', () => {
    expect(removeEmoji('Hi {{firstName}} 😊 we’re open!')).toBe("Hi {{firstName}} we're open!")
    expect(removeEmoji('Only ₱99')).toBe('Only P99')
  })
})

describe('variables', () => {
  test('the chips the composer offers', () => {
    expect(CAMPAIGN_VARIABLES.map((v) => v.key)).toEqual(['firstName', 'storeName', 'orderCount', 'lastOrderDate'])
  })

  test('unknown variables are listed once', () => {
    expect(unknownVariables('Hi {{firstName}} {{discount}} {{ discount }}')).toEqual(['discount'])
  })

  test('insertVariable puts the token at the cursor', () => {
    expect(insertVariable('Hi ', { start: 3, end: 3 }, 'firstName')).toEqual({ text: 'Hi {{firstName}}', cursor: 16 })
    expect(insertVariable('Hi', { start: 2, end: 2 }, 'firstName').text).toBe('Hi {{firstName}}')
  })

  test('renderSample fills sample values', () => {
    expect(renderSample('Hi {{firstName}} from {{storeName}}', "Lola's", null)).toBe("Hi Maria from Lola's")
    expect(renderSample('Hi', "Lola's", 'Reply STOP to opt out.')).toBe('Hi\nReply STOP to opt out.')
  })
})

describe('messageProblem', () => {
  test('empty, unknown word, too long', () => {
    expect(messageProblem('  ')).toBe('Write a message first.')
    expect(messageProblem('Hi {{discount}}')).toBe("We don't know {{discount}}. Use the chips above.")
    expect(messageProblem('x'.repeat(460))).toBe('Too long: keep it to 3 texts or less.')
    expect(messageProblem('Hi {{firstName}}')).toBeNull()
  })
})

describe('segmentMeter', () => {
  test('one text', () => {
    const meter = segmentMeter({ template: 'Hi {{firstName}}, see you!', storeName: "Lola's", optOutLine: null, reach: 148 })
    expect(meter.segments).toBe(1)
    expect(meter.tone).toBe('muted')
    expect(meter.text).toBe('1 text per guest · 18 of 160 characters')
  })

  test('two texts warns with the SIM cost', () => {
    const meter = segmentMeter({ template: 'a'.repeat(200), storeName: 'S', optOutLine: null, reach: 148 })
    expect(meter).toMatchObject({ segments: 2, tone: 'amber', text: '2 texts per guest · uses about 296 texts from your SIM' })
  })

  test('emoji that cost a text say so and offer the fix', () => {
    const meter = segmentMeter({ template: `${'a'.repeat(100)} 😊`, storeName: 'S', optOutLine: null, reach: 0 })
    expect(meter.tone).toBe('amber')
    expect(meter.text).toBe('Emoji make this 2 texts per guest. Remove 😊 to keep it to 1.')
    expect(meter.canRemoveEmoji).toBe(true)
  })

  test('more than three texts blocks', () => {
    const meter = segmentMeter({ template: 'a'.repeat(470), storeName: 'S', optOutLine: null, reach: 1 })
    expect(meter.tone).toBe('error')
    expect(meter.text).toBe('Too long: keep it to 3 texts or less.')
  })

  test('the opt-out line counts', () => {
    const meter = segmentMeter({ template: 'a'.repeat(150), storeName: 'S', optOutLine: 'Reply STOP to opt out.', reach: 1 })
    expect(meter.segments).toBe(2)
  })
})
