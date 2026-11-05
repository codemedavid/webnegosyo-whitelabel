import {
  FAMILY_OFFER_MAX_AGE_MS,
  familyOf,
  familyOffer,
  familyOfferMessage,
  familyStorageKey,
  nextFamilyPick,
  parseFamilyPick,
  withPageDone,
  type FamilyPick,
} from '@/lib/page-designer/templates-families'

const NOW = 1_800_000_000_000

const pick = (extra: Partial<FamilyPick> = {}): FamilyPick => ({ family: 'delivery-app', from: 'checkout', at: NOW, done: ['checkout'], ...extra })

describe('family looks: what to offer', () => {
  it('offers the matching template on the other pages, not the one it was picked on', () => {
    expect(familyOffer(pick(), 'confirmation', NOW)?.template).toMatchObject({ id: 'delivery-app', family: 'delivery-app' })
    expect(familyOffer(pick(), 'tracking', NOW)?.template.family).toBe('delivery-app')
    expect(familyOffer(pick(), 'checkout', NOW)).toBeNull()
  })

  it('never offers again once a page took or declined it, nor after the pick went stale', () => {
    expect(familyOffer(withPageDone(pick(), 'tracking'), 'tracking', NOW)).toBeNull()
    expect(familyOffer(pick({ at: NOW - FAMILY_OFFER_MAX_AGE_MS - 1 }), 'tracking', NOW)).toBeNull()
    expect(familyOffer(pick({ at: NOW + 60_000 }), 'tracking', NOW)).toBeNull()
    expect(familyOffer(null, 'tracking', NOW)).toBeNull()
  })

  it('words the offer with both pages', () => {
    const offer = familyOffer(pick(), 'confirmation', NOW)!
    expect(familyOfferMessage(offer, 'confirmation')).toBe('You picked the Delivery app look for checkout — use the matching thank-you look?')
  })
})

describe('family looks: remembering picks', () => {
  it('knows which templates belong to a family', () => {
    expect(familyOf('checkout', 'receipt-roll')).toBe('receipt-roll')
    expect(familyOf('checkout', 'standard')).toBeNull()
    expect(familyOf('tracking', 'nope')).toBeNull()
  })

  it('a family pick starts a new offer; the same family on another page joins it', () => {
    expect(nextFamilyPick(null, 'tracking', 'chat', NOW)).toEqual({ family: 'chat', from: 'tracking', at: NOW, done: ['tracking'] })
    const joined = nextFamilyPick(pick(), 'confirmation', 'delivery-app', NOW + 1)
    expect(joined).toEqual({ ...pick(), done: ['checkout', 'confirmation'] })
    expect(nextFamilyPick(pick(), 'confirmation', 'editorial', NOW)).toMatchObject({ family: 'editorial', from: 'confirmation', done: ['confirmation'] })
  })

  it('another template ends the offer on its own page and declines it elsewhere', () => {
    expect(nextFamilyPick(pick(), 'checkout', 'minimal', NOW)).toBeNull()
    expect(nextFamilyPick(pick(), 'tracking', 'minimal', NOW)).toEqual({ ...pick(), done: ['checkout', 'tracking'] })
    expect(nextFamilyPick(null, 'tracking', 'minimal', NOW)).toBeNull()
  })

  it('reads only well-formed stored picks', () => {
    expect(parseFamilyPick({ family: 'chat', from: 'tracking', at: NOW, done: ['checkout', 'nope', 'checkout'] })).toEqual({ family: 'chat', from: 'tracking', at: NOW, done: ['checkout'] })
    expect(parseFamilyPick({ family: 'chat', from: 'tracking', at: NOW })).toEqual({ family: 'chat', from: 'tracking', at: NOW, done: [] })
    expect(parseFamilyPick({ family: 'neon', from: 'tracking', at: NOW })).toBeNull()
    expect(parseFamilyPick({ family: 'chat', from: 'menu', at: NOW })).toBeNull()
    expect(parseFamilyPick({ family: 'chat', from: 'tracking', at: 'soon' })).toBeNull()
    expect(parseFamilyPick(['chat'])).toBeNull()
    expect(parseFamilyPick(null)).toBeNull()
  })

  it('keys the stored pick per store', () => {
    expect(familyStorageKey('t1')).toBe('pd-family:t1')
  })
})
