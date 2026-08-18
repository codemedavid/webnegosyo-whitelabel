/**
 * Which shelf a manual stock movement lands on, before the merchant says.
 *
 * The web stock dialog wrote every receive/waste/stocktake to the store pool
 * while order depletion wrote to the ORDER's branch — a multi-branch tenant's
 * shelves drifted apart from the day they opened a second shop. These rules
 * pick the default the selector starts on, and name the shelf a movement is
 * about to touch.
 */

import {
  resolveDefaultMovementOutlet,
  movementOutletLabel,
  STORE_POOL_LABEL,
} from '@/lib/inventory/stock-outlet'

const NORTH = { id: 'north-1', name: 'North' }
const SOUTH = { id: 'south-1', name: 'South' }

describe('resolveDefaultMovementOutlet', () => {
  it('keeps the store pool for a tenant with no branches — the behaviour every tenant has today', () => {
    expect(resolveDefaultMovementOutlet([])).toBeNull()
  })

  it('defaults a single-branch tenant to its one branch', () => {
    // One branch means every shelf IS that branch; defaulting to the pool
    // would recreate the drift the selector exists to end.
    expect(resolveDefaultMovementOutlet([NORTH])).toBe(NORTH.id)
  })

  it('defaults a multi-branch tenant to the store pool rather than guessing a branch', () => {
    expect(resolveDefaultMovementOutlet([NORTH, SOUTH])).toBeNull()
  })
})

describe('movementOutletLabel', () => {
  it('names the branch a movement is aimed at', () => {
    expect(movementOutletLabel(NORTH.id, [NORTH, SOUTH])).toBe('North')
  })

  it('calls the unbranched shelf the store pool', () => {
    expect(movementOutletLabel(null, [NORTH, SOUTH])).toBe(STORE_POOL_LABEL)
  })

  it('falls back to the store pool label for a branch it cannot name', () => {
    expect(movementOutletLabel('gone-1', [NORTH])).toBe(STORE_POOL_LABEL)
  })
})
