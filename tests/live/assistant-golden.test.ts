/** @jest-environment node */
/**
 * LIVE tool-routing eval: each golden prompt goes to the real model with the
 * real tool schemas; tools are NOT executed (stubbed results), so this measures
 * routing only and touches no database. Prints accuracy and cost.
 *
 *   ASSISTANT_GOLDEN=1 npx jest --config jest.config.cjs tests/live/assistant-golden.test.ts
 */
import fs from 'fs'
import path from 'path'
import golden from '../fixtures/assistant/golden.json'

const isLive = process.env.ASSISTANT_GOLDEN === '1'
if (isLive) {
  for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}
jest.mock('server-only', () => ({}))

interface GoldenCase {
  prompt: string
  expectTools: string[]
  /** At least one of these (several tools answer the question well). */
  expectAny?: string[]
  argsSubset?: Record<string, Record<string, unknown>>
  forbidTools?: string[]
}

const maybe = isLive ? describe : describe.skip

maybe('assistant golden routing (live model)', () => {
  jest.setTimeout(600_000)

  test('routes golden prompts to the right tools', async () => {
    const { streamText, stepCountIs, tool } = await import('ai')
    const { ASSISTANT_TOOLS } = await import('@/lib/assistant/tools')
    const { assistantModel } = await import('@/lib/assistant/runtime/ai-sdk')
    const { SYSTEM_PROMPT, buildContextNote } = await import('@/lib/assistant/prompt')
    const { summarizeTurnUsage } = await import('@/lib/assistant/usage')

    // Same names, descriptions and schemas as production; results are stubs.
    const tools = Object.fromEntries(
      ASSISTANT_TOOLS.map((def) => [def.name, tool({ description: def.description, inputSchema: def.input, execute: async () => ({ available: false, reason: 'eval stub' }) })]),
    )
    const system = `${SYSTEM_PROMPT}\n\n${buildContextNote({ storeName: 'Eval Store', now: new Date(), toolNames: ASSISTANT_TOOLS.map((t) => t.name) })}`

    let passed = 0
    let cost = 0
    const failures: string[] = []
    for (const testCase of golden as GoldenCase[]) {
      const result = streamText({ model: assistantModel('golden-eval'), system, prompt: testCase.prompt, tools, stopWhen: stepCountIs(1) })
      await result.consumeStream()
      const steps = await result.steps
      cost += summarizeTurnUsage(steps).costUsd
      const calls = steps.flatMap((step) => step.toolCalls.map((call) => ({ name: call.toolName, input: call.input as Record<string, unknown> })))
      const names = calls.map((call) => call.name)
      const hasExpected =
        testCase.expectTools.every((name) => names.includes(name)) &&
        (!testCase.expectAny || testCase.expectAny.some((name) => names.includes(name)))
      const hasForbidden = (testCase.forbidTools ?? []).some((name) => names.includes(name))
      const argsOk = Object.entries(testCase.argsSubset ?? {}).every(([name, args]) =>
        calls.some((call) => call.name === name && Object.entries(args).every(([key, value]) => call.input[key] === value)),
      )
      if (hasExpected && !hasForbidden && argsOk) passed += 1
      else failures.push(`${testCase.prompt} → ${JSON.stringify(calls)}`)
    }

    const total = (golden as GoldenCase[]).length
    process.stdout.write(`\nGOLDEN: ${passed}/${total} (${Math.round((passed / total) * 100)}%), cost $${cost.toFixed(5)}\n${failures.map((f) => `  ✗ ${f}`).join('\n')}\n`)
    expect(passed / total).toBeGreaterThanOrEqual(0.85)
  })
})
