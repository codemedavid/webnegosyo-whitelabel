import {
  getBcgLabel,
  getBcgDescription,
  getStrategyLabel,
  getStrategyDescription,
  BCG_MERCHANT_LABELS,
  STRATEGY_MERCHANT_LABELS,
} from '@/lib/bcg-labels'

describe('bcg-labels', () => {
  describe('getBcgLabel', () => {
    it('maps star to Best Seller', () => {
      expect(getBcgLabel('star')).toBe('Best Seller')
    })

    it('maps plowhorse to Popular', () => {
      expect(getBcgLabel('plowhorse')).toBe('Popular')
    })

    it('maps puzzle to Hidden Gem', () => {
      expect(getBcgLabel('puzzle')).toBe('Hidden Gem')
    })

    it('maps dog to Slow Mover', () => {
      expect(getBcgLabel('dog')).toBe('Slow Mover')
    })

    it('maps unclassified to New', () => {
      expect(getBcgLabel('unclassified')).toBe('New')
    })

    it('returns New for undefined', () => {
      expect(getBcgLabel(undefined)).toBe('New')
    })
  })

  describe('getStrategyLabel', () => {
    it('maps plowhorse_to_star to Boost your margins', () => {
      expect(getStrategyLabel('plowhorse_to_star')).toBe('Boost your margins')
    })

    it('maps star_to_star to Maximize order value', () => {
      expect(getStrategyLabel('star_to_star')).toBe('Maximize order value')
    })

    it('maps puzzle_to_plowhorse to Get hidden gems noticed', () => {
      expect(getStrategyLabel('puzzle_to_plowhorse')).toBe('Get hidden gems noticed')
    })

    it('returns the key for unknown strategies', () => {
      expect(getStrategyLabel('unknown_strategy')).toBe('unknown_strategy')
    })
  })

  describe('getStrategyDescription', () => {
    it('returns merchant-friendly description for plowhorse_to_star', () => {
      expect(getStrategyDescription('plowhorse_to_star')).toBe(
        'These popular items could pull in higher-profit add-ons'
      )
    })
  })
})
