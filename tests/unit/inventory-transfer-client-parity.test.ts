/**
 * The two doors onto one transfer service must stay the same door.
 *
 * Every public transfer function exists twice: `createTransfer` builds a COOKIE
 * client (`@/lib/supabase/server`) for the web admin, and `createTransferWith`
 * takes a client it is handed, which is how the merchant app reaches the same
 * code with a BEARER token. The split exists because a cookie client resolves
 * no session for a phone, which would leave `resolveActingBranchScope` deciding
 * branch authority for nobody.
 *
 * The hazard is drift. The moment the cookie variant grows a rule — a check, a
 * default, a normalisation — that the `...With` variant does not delegate to,
 * the web admin and the phone stop enforcing the same thing about the same
 * stock, and the surface that drifts is whichever one nobody is looking at.
 *
 * This is a SOURCE guard rather than a behavioural test on purpose. What is
 * being protected is a structural property — "the plain variant does nothing
 * but delegate" — and any test that ran the functions would have to mock a
 * Supabase client thoroughly enough to hide exactly the divergence it is
 * looking for.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const SOURCE = readFileSync(
  join(process.cwd(), 'src/lib/inventory/stock-transfers-service.ts'),
  'utf8',
)

/** The four steps of a transfer's life, each of which has both variants. */
const STEPS = ['createTransfer', 'sendTransfer', 'receiveTransfer', 'cancelTransfer'] as const

/** The body of a top-level exported function, up to the closing brace. */
function bodyOf(name: string): string {
  const start = SOURCE.indexOf(`export async function ${name}(`)
  if (start === -1) throw new Error(`${name} is not exported from the transfers service`)

  const end = SOURCE.indexOf('\n}', start)
  return SOURCE.slice(start, end)
}

describe('every transfer step is reachable with a caller-supplied client', () => {
  it.each(STEPS)('%s has a ...With variant', (step) => {
    // Without one the merchant app cannot perform that step at all: its bearer
    // token has nowhere to go.
    expect(SOURCE).toContain(`export async function ${step}With(`)
  })
})

describe('the cookie variant only delegates', () => {
  it.each(STEPS)('%s does nothing the app would miss', (step) => {
    const body = bodyOf(step)

    // Exactly one statement, and it is the handoff. A rule added here rather
    // than inside the `...With` variant would apply to the web admin and not
    // to the phone — two doors onto one document, disagreeing.
    expect(body).toContain(`return ${step}With(await createClient()`)

    const statements = body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('//') && !line.startsWith('*'))
      .filter((line) => line.startsWith('return ') || /^(if|const|let|await|throw|try)\b/.test(line))

    expect(statements).toHaveLength(1)
  })
})

describe('the shared schema is the only shape check', () => {
  it('parses a draft with the schema both doors use', () => {
    // `/api/inventory/transfers` parses `transferDraftSchema` and so does the
    // web action. A third notion of a valid draft inside the service would be
    // the one that drifts, because nothing else imports it.
    expect(SOURCE).not.toMatch(/z\.object\(/)
  })
})
