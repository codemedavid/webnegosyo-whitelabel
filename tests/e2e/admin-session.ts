/**
 * A real admin session for sample-demo without touching anyone's password.
 *
 * The service role mints a magic-link token (`generateLink` sends no email);
 * an @supabase/ssr client verifies it and the session cookies it writes are
 * handed to the Playwright context, so the app reads them exactly like a
 * browser login.
 */
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

export interface BrowserCookie {
  name: string
  value: string
  domain: string
  path: string
  httpOnly: boolean
  secure: boolean
  sameSite: 'Lax'
}

export async function adminSessionCookies(email: string, domain: string): Promise<BrowserCookie[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) throw new Error('Supabase env missing (.env.local)')

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (linkError || !link.properties?.hashed_token) throw new Error(`generateLink: ${linkError?.message ?? 'no token'}`)

  const jar = new Map<string, string>()
  const ssr = createServerClient(url, anon, {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  })
  const { error } = await ssr.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token })
  if (error) throw new Error(`verifyOtp: ${error.message}`)
  if (!jar.size) throw new Error('verifyOtp wrote no session cookie')
  return [...jar.entries()].map(([name, value]) => ({ name, value, domain, path: '/', httpOnly: false, secure: false, sameSite: 'Lax' }))
}
