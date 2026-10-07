import type { NextResponse } from 'next/server'

/**
 * Carry the cookies Supabase wrote during `auth.getUser()` onto a response the
 * middleware built itself (a guard redirect).
 *
 * `getUser()` writes through the session response: a refresh rotates the token
 * pair, and a dead refresh token (`refresh_token_not_found`) deletes the auth
 * cookies. A guard that answers with a fresh `NextResponse.redirect` drops
 * those writes — the browser keeps a token GoTrue has already burned (the next
 * request signs the admin out) or a dead cookie it re-sends forever, logging
 * the same AuthApiError on every request. Every middleware exit must carry them.
 */
export function carrySessionCookies(target: NextResponse, session: NextResponse): NextResponse {
  session.cookies.getAll().forEach((cookie) => target.cookies.set(cookie))
  return target
}
