/**
 * Shared Lalamove status vocabulary.
 *
 * Book/sync/cancel logic lives in three places (server actions, /api/lalamove,
 * the Convex template) and each grew its own idea of which statuses are
 * "final" and how to color a badge. The drift was already user-visible:
 * ASSIGNING_DRIVER — the very first status every booking gets — rendered in
 * the admin panel's yellow "unknown" bucket, and the server action would
 * happily cancel a delivery that had already finished. One module owns the
 * vocabulary now.
 */

import { describe, test, expect } from '@jest/globals'
import {
  isLalamoveFinal,
  isActiveLalamoveDelivery,
  lalamoveStatusTone,
} from '@/lib/lalamove-status'

describe('isLalamoveFinal', () => {
  test.each(['COMPLETED', 'DELIVERED', 'CANCELED', 'CANCELLED', 'REJECTED', 'EXPIRED'])(
    'treats %s as the end of the delivery',
    (status) => {
      expect(isLalamoveFinal(status)).toBe(true)
    },
  )

  test('is case-insensitive — Lalamove and our own writes disagree on casing', () => {
    expect(isLalamoveFinal('cancelled')).toBe(true)
    expect(isLalamoveFinal('Completed')).toBe(true)
  })

  test.each(['ASSIGNING_DRIVER', 'ON_GOING', 'PICKED_UP'])(
    'a delivery in %s can still be cancelled or tipped',
    (status) => {
      expect(isLalamoveFinal(status)).toBe(false)
    },
  )

  test('an absent status is not final — the delivery may not even exist yet', () => {
    expect(isLalamoveFinal(null)).toBe(false)
    expect(isLalamoveFinal(undefined)).toBe(false)
    expect(isLalamoveFinal('')).toBe(false)
  })
})

describe('isActiveLalamoveDelivery', () => {
  test('a booked, unfinished delivery is active — this is what drives auto-sync', () => {
    expect(isActiveLalamoveDelivery('ASSIGNING_DRIVER')).toBe(true)
    expect(isActiveLalamoveDelivery('ON_GOING')).toBe(true)
    expect(isActiveLalamoveDelivery('PICKED_UP')).toBe(true)
  })

  test('finished or absent deliveries are not active — polling them wastes API calls', () => {
    expect(isActiveLalamoveDelivery('COMPLETED')).toBe(false)
    expect(isActiveLalamoveDelivery('CANCELLED')).toBe(false)
    expect(isActiveLalamoveDelivery(null)).toBe(false)
    expect(isActiveLalamoveDelivery('')).toBe(false)
  })
})

describe('lalamoveStatusTone', () => {
  test('ASSIGNING_DRIVER reads as searching — the regression that sat in the yellow bucket', () => {
    expect(lalamoveStatusTone('ASSIGNING_DRIVER')).toBe('searching')
  })

  test('real v3 statuses all resolve to a meaningful tone, not unknown', () => {
    expect(lalamoveStatusTone('ON_GOING')).toBe('active')
    expect(lalamoveStatusTone('PICKED_UP')).toBe('active')
    expect(lalamoveStatusTone('COMPLETED')).toBe('done')
    expect(lalamoveStatusTone('CANCELED')).toBe('cancelled')
    expect(lalamoveStatusTone('REJECTED')).toBe('cancelled')
    expect(lalamoveStatusTone('EXPIRED')).toBe('cancelled')
  })

  test('legacy statuses written by older code keep their meaning', () => {
    expect(lalamoveStatusTone('ASSIGNING')).toBe('searching')
    expect(lalamoveStatusTone('ASSIGNED')).toBe('active')
    expect(lalamoveStatusTone('IN_TRANSIT')).toBe('active')
    expect(lalamoveStatusTone('DELIVERED')).toBe('done')
    expect(lalamoveStatusTone('CANCELLED')).toBe('cancelled')
  })

  test('anything unrecognized is unknown rather than a wrong color', () => {
    expect(lalamoveStatusTone('SOMETHING_NEW')).toBe('unknown')
    expect(lalamoveStatusTone(null)).toBe('unknown')
  })
})
