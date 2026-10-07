/** @jest-environment node */
/**
 * The golden eval set stays honest: every tool it names exists, and every
 * expected argument is one that tool's real schema accepts. (The set itself is
 * scored against the live model by tests/live/assistant-golden.test.ts.)
 */
import golden from '../../fixtures/assistant/golden.json'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))

interface GoldenCase {
  prompt: string
  expectTools: string[]
  /** At least one of these (several tools answer the question well). */
  expectAny?: string[]
  argsSubset?: Record<string, Record<string, unknown>>
  forbidTools?: string[]
}

test.each(golden as GoldenCase[])('golden case is valid: $prompt', async (testCase) => {
  const { ASSISTANT_TOOLS } = await import('@/lib/assistant/tools')
  const byName = new Map(ASSISTANT_TOOLS.map((tool) => [tool.name, tool]))

  for (const name of [...testCase.expectTools, ...(testCase.expectAny ?? []), ...(testCase.forbidTools ?? [])]) expect(byName.has(name)).toBe(true)
  for (const [name, args] of Object.entries(testCase.argsSubset ?? {})) {
    const shape = (byName.get(name)?.input as unknown as { shape: Record<string, { safeParse(v: unknown): { success: boolean } }> }).shape
    for (const [key, value] of Object.entries(args)) expect(shape[key].safeParse(value).success).toBe(true)
  }
})
