/**
 * Doctor's admin check: mint a sample-demo admin session (service-role magic link, no email sent,
 * no password touched — tests/e2e/admin-session.ts) and GET an admin page with it.
 *
 *   npx tsx .claude/skills/verify-webnegosyo/bin/admin-check.ts [path=/admin/orders]
 *
 * Prints JSON { status, finalUrl, verdict } where verdict is ok | login | on-hold | error.
 */
import { config as loadEnv } from 'dotenv'

import { adminSessionCookies } from '../../../../tests/e2e/admin-session'

loadEnv({ path: '.env.local' })

const ADMIN_EMAIL = process.env.QA_ADMIN_EMAIL ?? 'admin@sampledemowebnegosyo.com'
const BASE = `http://sample-demo.localhost:${process.env.QA_PORT ?? '3100'}`

async function main() {
  const path = process.argv[2] ?? '/admin/orders'
  const cookies = await adminSessionCookies(ADMIN_EMAIL, 'sample-demo.localhost')
  const header = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  const res = await fetch(`${BASE}${path}`, { headers: { cookie: header }, redirect: 'follow', signal: AbortSignal.timeout(240_000) })
  await res.text()
  const finalUrl = res.url
  let verdict = 'ok'
  const finalPath = new URL(finalUrl).pathname
  if (/\/login/.test(finalPath)) verdict = 'login'
  // An overdue store is redirected to /<slug>/subscription ("account on hold") for every admin page.
  else if (/\/subscription$/.test(finalPath)) verdict = 'on-hold'
  else if (res.status >= 400) verdict = 'error'
  console.log(JSON.stringify({ status: res.status, finalUrl, verdict }))
  if (verdict !== 'ok') process.exitCode = 1
}

main().catch((error) => {
  console.log(JSON.stringify({ verdict: 'error', message: (error as Error).message }))
  process.exit(1)
})
