/**
 * The recipe registry is the ONE place a recipe is defined. Every screen, the
 * planner, the AI tools and onboarding read it, so these tests run over the
 * whole registry: a new recipe that forgets a default, ships a message that
 * cannot render, or shares a priority fails here, not in a guest's inbox.
 */

import { RECIPES, getRecipe, resolveParams, describeAutomation, clampParams } from '@/lib/sms-automations/recipes'
import { validateAutomationMessage, renderAutomationText, countSmsSegments } from '@/lib/sms-automations/template'
import { RECIPE_IDS } from '@/lib/sms-automations/types'
import type { Candidate } from '@/lib/sms-automations/types'

const NOW = new Date('2026-10-12T04:00:00Z')
const SAMPLE: Candidate = {
  guest: {
    id: 'c1', name: 'Maria Santos', phone: '+639171234567', smsConsent: true, smsOptOut: false,
    orderCount: 4, totalSpent: 1250, firstOrderAt: '2026-08-01T02:00:00Z',
    lastOrderAt: '2026-09-02T02:00:00Z', favoriteItem: 'Spanish Latte',
  },
  occurrenceKey: 'k', dueAt: NOW.toISOString(), expiresAt: NOW.toISOString(),
  loyalty: { progressLeft: '2 stamps', remaining: 2, rewardName: 'Free Iced Tea', rewardExpiresAt: '2026-10-20T00:00:00Z' },
}
const STORE = { tenantId: 't1', storeName: 'Kape Ni Ana', baseUrl: 'https://kapenianana.webnegosyo.com' }

describe('recipe registry', () => {
  it('defines every recipe id exactly once', () => {
    expect(RECIPES.map((recipe) => recipe.id).sort()).toEqual([...RECIPE_IDS].sort())
  })

  it('gives every recipe a distinct priority so a guest gets the most useful text first', () => {
    const priorities = RECIPES.map((recipe) => recipe.priority)
    expect(new Set(priorities).size).toBe(priorities.length)
    // Reward reminders outrank everything; win-back is last.
    expect(getRecipe('loyalty_reward_expiring').priority).toBeLessThan(getRecipe('review_request').priority)
    expect(getRecipe('win_back').priority).toBe(Math.max(...priorities))
  })

  it.each(RECIPES.map((recipe) => [recipe.id, recipe] as const))(
    '%s: both default messages validate, render and fit two texts',
    (_id, recipe) => {
      for (const message of [recipe.defaultMessage, recipe.defaultMessageTl]) {
        expect(validateAutomationMessage(recipe.id, message)).toEqual({ ok: true })
        const text = renderAutomationText(message, SAMPLE, STORE, { reviewUrl: 'https://g.page/r/kapenianana/review', optOutLine: 'Reply STOP to stop texts' }, NOW)
        expect(text).not.toMatch(/\{\{/)
        expect(countSmsSegments(text).segments).toBeLessThanOrEqual(2)
      }
    },
  )

  it.each(RECIPES.map((recipe) => [recipe.id, recipe] as const))(
    '%s: defaults sit inside the limits the editor allows',
    (_id, recipe) => {
      const params = resolveParams(recipe.id, {})
      for (const [key, [min, max]] of Object.entries(recipe.limits)) {
        const value = params[key as keyof typeof params]
        expect(value).toBeGreaterThanOrEqual(min)
        expect(value).toBeLessThanOrEqual(max)
      }
      expect(recipe.defaultReentryDays).toBeGreaterThan(0)
    },
  )

  it('fills missing params from the recipe and keeps the owner’s', () => {
    expect(resolveParams('win_back', {})).toMatchObject({ inactiveDays: 30 })
    expect(resolveParams('win_back', { inactiveDays: 45 })).toMatchObject({ inactiveDays: 45 })
    expect(resolveParams('review_request', {})).toMatchObject({ delayHours: 3, minOrderCount: 2 })
  })

  it('clamps out-of-range knobs instead of storing them', () => {
    expect(clampParams('win_back', { inactiveDays: 5000 }).inactiveDays).toBe(getRecipe('win_back').limits.inactiveDays![1])
    expect(clampParams('review_request', { delayHours: 0 }).delayHours).toBe(1)
    expect(clampParams('win_back', { delayHours: 3 } as never)).not.toHaveProperty('delayHours')
  })

  it('describes an automation as one plain sentence with its numbers', () => {
    expect(describeAutomation('review_request', {})).toBe('3 hours after an order, ask repeat guests for a review')
    expect(describeAutomation('review_request', { minOrderCount: 1 })).toBe('3 hours after an order, ask for a review')
    expect(describeAutomation('win_back', { inactiveDays: 45 })).toBe('Text guests who haven’t ordered in 45 days')
    expect(describeAutomation('loyalty_almost_there', { remainingAtMost: 1 })).toBe('Text guests 1 stamp away from a reward')
  })
})
