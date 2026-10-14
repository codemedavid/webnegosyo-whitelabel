/**
 * Run settings for fast-check properties (plan §10.1: 200 runs on every
 * change, 5000 nightly).
 *
 *   FC_NUM_RUNS   runs per property (default 200; the nightly job sets 5000)
 *   FC_SEED       replay a reported failure: the seed fast-check printed
 *   FC_PATH       …and its counterexample path, to skip straight to it
 *
 * A failing property prints `seed` and `path`; rerun the one suite with both
 * set to reproduce it exactly, shrunk.
 */
import type { Parameters } from 'fast-check'

export const DEFAULT_PROPERTY_RUNS = 200

type PropertyEnv = Readonly<Record<string, string | undefined>>

function positiveInteger(name: string, raw: string): number {
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`)
  }
  return value
}

/** Runs per property, from FC_NUM_RUNS. A malformed value fails loudly. */
export function propertyRuns(env: PropertyEnv = process.env): number {
  const raw = env.FC_NUM_RUNS?.trim()
  return raw ? positiveInteger('FC_NUM_RUNS', raw) : DEFAULT_PROPERTY_RUNS
}

/** fast-check parameters for `fc.assert`, honouring the replay variables. */
export function propertyParameters<T>(
  overrides: Parameters<T> = {},
  env: PropertyEnv = process.env,
): Parameters<T> {
  const seed = env.FC_SEED?.trim()
  const path = env.FC_PATH?.trim()
  if (seed && !/^-?\d+$/.test(seed)) throw new Error(`FC_SEED must be an integer, got "${seed}"`)
  return {
    numRuns: propertyRuns(env),
    ...(seed ? { seed: Number(seed) } : {}),
    ...(path ? { path } : {}),
    ...overrides,
  }
}
