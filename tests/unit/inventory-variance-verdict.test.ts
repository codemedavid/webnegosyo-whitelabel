/**
 * Phase 3 — the one-line verdict, and refusing to give one.
 *
 * Variance is measured against theoretical usage (the AvT comparison): the
 * money the shelf is short, as a share of the money the recipes say was used.
 * 1–2% is a well-run kitchen, 3–5% tolerable, above 5% systemic.
 *
 * The dangerous half of this module is the refusal. A tenant with no recipes
 * deducts nothing, so its usage is zero, its shrinkage is zero, and it scores a
 * flawless day forever — `brewdazeexpress` has inventory switched on, 51 dishes
 * and 0 recipes today. A verdict must therefore never be stated before the
 * report has established that it had something to judge.
 */

import { judgeVariance } from '@/lib/inventory/variance-verdict'

/** A day that can legitimately be judged: recipes exist, someone counted. */
function judgeable(overrides: Partial<Parameters<typeof judgeVariance>[0]> = {}) {
  return judgeVariance({
    cogs: 1000,
    shrinkageCost: 10,
    countedCount: 5,
    dishesWithRecipe: 10,
    ...overrides,
  })
}

describe('judgeVariance — grading a day it can judge', () => {
  test('calls a 1% shortfall well run', () => {
    // Arrange: ₱10 missing against ₱1,000 of theoretical usage.
    // Act
    const verdict = judgeable()

    // Assert
    expect(verdict.level).toBe('good')
    expect(verdict.percent).toBe(1)
  })

  test('calls a 4% shortfall worth watching', () => {
    expect(judgeable({ shrinkageCost: 40 }).level).toBe('watch')
  })

  test('calls an 8% shortfall worth investigating', () => {
    expect(judgeable({ shrinkageCost: 80 }).level).toBe('investigate')
  })

  test('treats exactly 2% as still well run', () => {
    // Boundary: the benchmark is "1-2% is well run", so 2 is inside it.
    expect(judgeable({ shrinkageCost: 20 }).level).toBe('good')
  })

  test('treats exactly 5% as watch rather than investigate', () => {
    // Boundary: "3-5% tolerable" — 5 is the top of tolerable, not the bottom
    // of systemic.
    expect(judgeable({ shrinkageCost: 50 }).level).toBe('watch')
  })

  test('reports a spotless day as good, not as unjudgeable', () => {
    // Nothing missing IS a verdict, provided someone counted and recipes exist.
    const verdict = judgeable({ shrinkageCost: 0 })

    expect(verdict.level).toBe('good')
    expect(verdict.percent).toBe(0)
  })

  test('always carries a headline a merchant can read', () => {
    expect(judgeable().headline.length).toBeGreaterThan(0)
    expect(judgeable().detail.length).toBeGreaterThan(0)
  })
})

describe('judgeVariance — refusing to judge', () => {
  test('refuses when no dish has a recipe', () => {
    // The brewdazeexpress case. Zero usage and zero shrinkage are artefacts of
    // an unconfigured system, and grading them "good" is the single most
    // misleading thing this report could say.
    const verdict = judgeable({ dishesWithRecipe: 0, cogs: 0, shrinkageCost: 0 })

    expect(verdict.level).toBeNull()
    expect(verdict.percent).toBeNull()
  })

  test('names recipes as the thing to fix when none exist', () => {
    const verdict = judgeable({ dishesWithRecipe: 0, cogs: 0, shrinkageCost: 0 })

    expect(verdict.detail).toContain('recipe')
  })

  test('refuses when nothing was physically counted', () => {
    // Shrinkage is only discoverable by comparing the shelf to the book. With
    // no count, zero shrinkage means "not looked for", not "none".
    const verdict = judgeable({ countedCount: 0 })

    expect(verdict.level).toBeNull()
  })

  test('names counting as the thing to do when nothing was counted', () => {
    expect(judgeable({ countedCount: 0 }).detail).toContain('count')
  })

  test('blames the missing recipes first when both are missing', () => {
    // Recipes are the deeper fault: counting a shelf whose usage is never
    // deducted still yields a meaningless comparison.
    const verdict = judgeable({ dishesWithRecipe: 0, countedCount: 0, cogs: 0 })

    expect(verdict.detail).toContain('recipe')
  })

  test('refuses when recipes exist but the day used nothing', () => {
    // A day with recipes and counts but no usage has a zero denominator; a
    // percentage of nothing is not a grade.
    const verdict = judgeable({ cogs: 0, shrinkageCost: 0 })

    expect(verdict.level).toBeNull()
  })

  test('still explains itself when it cannot judge', () => {
    const verdict = judgeable({ dishesWithRecipe: 0, cogs: 0 })

    expect(verdict.headline.length).toBeGreaterThan(0)
    expect(verdict.detail.length).toBeGreaterThan(0)
  })
})
