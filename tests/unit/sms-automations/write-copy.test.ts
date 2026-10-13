/**
 * "Write it for me": the model drafts three messages; only messages the
 * engine can fill, that text cheaply, and that promise nothing the store
 * never said, reach the owner.
 */

import { acceptWrittenMessages, buildWritePrompt } from '@/lib/sms-automations/write-copy'

const answer = (messages: unknown) => JSON.stringify({ messages })

describe('acceptWrittenMessages', () => {
  it('keeps clean, fillable, cheap messages', () => {
    const result = acceptWrittenMessages(answer([
      'Hi {{firstName}}, we miss you at {{storeName}}! Your {{favoriteItem}} is waiting: {{menuLink}}',
      'Hello {{firstName}}! It has been a while. Drop by {{storeName}} soon? {{menuLink}}',
    ]), 'win_back')
    expect(result).toHaveLength(2)
  })

  it('reads JSON wrapped in prose or a code fence', () => {
    expect(acceptWrittenMessages('Sure! ```json\n' + answer(['Hi {{firstName}}, come back to {{storeName}}! {{menuLink}}']) + '\n```', 'win_back')).toHaveLength(1)
  })

  it('drops messages that invent offers, numbers, links or claims', () => {
    expect(acceptWrittenMessages(answer([
      'Hi {{firstName}}, get 20% off at {{storeName}}!',
      'Hi {{firstName}}, FREE dessert today at {{storeName}}!',
      'Hi {{firstName}}, order at https://evil.example now',
      'Hi {{firstName}}, the best burgers in town at {{storeName}}!',
      'Hi {{firstName}}, P50 off your next order!',
    ]), 'win_back')).toEqual([])
  })

  it('drops words the recipe cannot fill and emoji that cost more', () => {
    expect(acceptWrittenMessages(answer([
      'Hi {{firstName}}, your {{rewardName}} is waiting!',
      'Hi {{firstName}} 😍 come back to {{storeName}}!',
    ]), 'win_back')).toEqual([])
  })

  it('lets loyalty messages name the reward through its placeholder', () => {
    expect(acceptWrittenMessages(answer(['Hi {{firstName}}, your {{rewardName}} at {{storeName}} is ready to claim! {{loyaltyLink}}']), 'loyalty_reward_waiting'))
      .toHaveLength(1)
  })

  it('fixes curly quotes instead of paying for them, and drops duplicates', () => {
    const result = acceptWrittenMessages(answer([
      'Hi {{firstName}}, we’d love to see you at {{storeName}}! {{menuLink}}',
      "Hi {{firstName}}, we'd love to see you at {{storeName}}! {{menuLink}}",
    ]), 'win_back')
    expect(result).toEqual(["Hi {{firstName}}, we'd love to see you at {{storeName}}! {{menuLink}}"])
  })

  it('returns nothing for an answer it cannot read', () => {
    expect(acceptWrittenMessages('no json here', 'win_back')).toEqual([])
    expect(acceptWrittenMessages(answer('not a list'), 'win_back')).toEqual([])
  })
})

describe('buildWritePrompt', () => {
  it('tells the model the moment, the words it may use and the language', () => {
    const [system, user] = buildWritePrompt({ recipe: 'review_request', language: 'tl', storeName: 'Kape Ni Ana' })
    expect(system.content).toMatch(/JSON/)
    expect(user.content).toContain('{{reviewLink}}')
    expect(user.content).toMatch(/Taglish/)
    expect(user.content).toContain('Kape Ni Ana')
  })
})
