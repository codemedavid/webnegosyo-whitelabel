/**
 * @jest-environment node
 */
/**
 * The anon INSERT policies on `orders` / `order_items` are being dropped, so
 * nothing on a customer path may write those tables with a session client.
 * Every platform insert must go through the service role (after the checks in
 * `createOrderAction`), and the customer app must go through the web API.
 */
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

/** Source with comments removed, so prose about the old design cannot fail a check. */
const code = (relative: string) =>
  read(relative).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(rel, out)
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(rel)
  }
  return out
}

describe('platform order writers', () => {
  const service = code('src/lib/orders-service.ts')

  it('writes the order row with the service-role writer', () => {
    expect(service).toMatch(/const orderWriter = createAdminClient\(\)/)
    expect(service).toMatch(/orderWriter\s*\.from\('orders'\)\s*\.insert\(/)
  })

  it('writes the order lines with the same service-role writer', () => {
    expect(service).toMatch(/orderWriter\s*\.from\('order_items'\)\s*\.insert\(/)
  })

  it('always writes a pending, unpaid order whatever the caller sent', () => {
    expect(service).toMatch(/payment_status: 'pending'/)
    expect(service).toMatch(/\n\s+status: 'pending'/)
  })

  it('has no other insert into orders / order_items in src/', () => {
    const offenders = walk('src')
      .filter((file) => {
        const text = code(file)
        return /\.from\(['"](orders|order_items)['"]\)\s*\.insert\(/.test(text)
      })
      .sort()

    expect(offenders).toEqual(['src/lib/orders-service.ts'])
  })
})

describe('customer app', () => {
  it('does not insert into orders or order_items', () => {
    const files = walk('mobile/app').concat(walk('mobile/lib'), walk('mobile/stores'))

    const offenders = files.filter((file) =>
      /from\(['"](orders|order_items)['"]\)/.test(code(file)) && /\.insert\(/.test(code(file)),
    )

    expect(offenders).toEqual([])
  })
})
