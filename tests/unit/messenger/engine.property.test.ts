/**
 * Messenger engine properties. A payload that doesn't round-trip sends a
 * customer the wrong category; a keyword that matches inside another word
 * answers a message nobody asked about; a clip over Meta's limit makes Meta
 * refuse the whole reply.
 */
import fc from 'fast-check'
import { decodePayload, encodePayload, type MessengerPayload } from '@/lib/messenger/payload'
import { matchesKeyword, normalizeForMatch } from '@/lib/messenger/match'
import { charLength, clip } from '@/lib/messenger/limits'
import { propertyParameters } from '../../utils/property'

const id = fc.stringMatching(/^[A-Za-z0-9_-]{1,64}$/)
const payloadArb: fc.Arbitrary<MessengerPayload> = fc.oneof(
  fc.constant<MessengerPayload>({ verb: 'start' }),
  fc.constant<MessengerPayload>({ verb: 'menu' }),
  fc.constant<MessengerPayload>({ verb: 'categories' }),
  fc.constant<MessengerPayload>({ verb: 'staff' }),
  id.map((ruleId): MessengerPayload => ({ verb: 'rule', ruleId })),
  fc.tuple(id, fc.integer({ min: 0, max: 50 })).map(([categoryId, page]): MessengerPayload => ({ verb: 'category', categoryId, page })),
)
const word = fc.stringMatching(/^[a-z]{2,8}$/)

describe('messenger engine properties', () => {
  it('every payload round-trips and fits Meta\'s 1000 characters', () => {
    fc.assert(fc.property(payloadArb, (payload) => {
      const encoded = encodePayload(payload)
      expect(encoded.length).toBeLessThanOrEqual(1000)
      expect(decodePayload(encoded)).toEqual(payload)
    }), propertyParameters())
  })

  it('decoding never throws on anything a customer could send', () => {
    fc.assert(fc.property(fc.string({ maxLength: 300 }), (raw) => {
      expect(() => decodePayload(raw)).not.toThrow()
    }), propertyParameters())
  })

  it('a keyword matches as a whole word, never inside a longer one', () => {
    fc.assert(fc.property(word, word, fc.array(word, { maxLength: 4 }), (keyword, glued, others) => {
      fc.pre(!others.includes(keyword) && glued !== '')
      const around = others.join(' ')
      expect(matchesKeyword(`${around} ${keyword}! ${around}`, keyword, 'contains')).toBe(true)
      // Glued onto another word, it is a different word.
      fc.pre(!` ${around} `.includes(` ${keyword} `))
      expect(matchesKeyword(`${around} ${keyword}${glued} ${around}`, keyword, 'contains')).toBe(false)
    }), propertyParameters())
  })

  it('normalising is idempotent', () => {
    fc.assert(fc.property(fc.string({ maxLength: 120 }), (text) => {
      expect(normalizeForMatch(normalizeForMatch(text))).toBe(normalizeForMatch(text))
    }), propertyParameters())
  })

  it('clip never exceeds the limit and never splits an emoji', () => {
    fc.assert(fc.property(fc.string({ unit: 'grapheme', maxLength: 200 }), fc.integer({ min: 1, max: 90 }), (text, max) => {
      const clipped = clip(text, max)
      expect(charLength(clipped)).toBeLessThanOrEqual(max)
      expect(clipped).not.toMatch(/[\uD800-\uDBFF]$/)
    }), propertyParameters())
  })
})
