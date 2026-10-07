/**
 * @jest-environment node
 */
import { NextResponse } from 'next/server'

describe('carrySessionCookies', () => {
  it('copies refreshed session cookies onto a guard redirect', async () => {
    // Arrange
    const { carrySessionCookies } = await import('@/lib/middleware/session-cookies')
    const session = NextResponse.next()
    session.cookies.set('sb-proj-auth-token', 'rotated', { path: '/', httpOnly: true })
    const redirect = NextResponse.redirect('https://shop.test/shop/login')

    // Act
    const result = carrySessionCookies(redirect, session)

    // Assert
    expect(result.cookies.get('sb-proj-auth-token')?.value).toBe('rotated')
    expect(result.headers.get('location')).toBe('https://shop.test/shop/login')
  })

  it('carries a cookie deletion so a dead session is cleared on redirect', async () => {
    // Arrange
    const { carrySessionCookies } = await import('@/lib/middleware/session-cookies')
    const session = NextResponse.next()
    session.cookies.set('sb-proj-auth-token', '', { path: '/', maxAge: 0 })
    const redirect = NextResponse.redirect('https://shop.test/shop/login')

    // Act
    const result = carrySessionCookies(redirect, session)

    // Assert
    const setCookie = result.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('sb-proj-auth-token=')
    expect(setCookie).toMatch(/Max-Age=0/i)
  })

  it('leaves the redirect untouched when the session set no cookies', async () => {
    // Arrange
    const { carrySessionCookies } = await import('@/lib/middleware/session-cookies')
    const redirect = NextResponse.redirect('https://shop.test/shop/admin?denied=pos')

    // Act
    const result = carrySessionCookies(redirect, NextResponse.next())

    // Assert
    expect(result.headers.get('set-cookie')).toBeNull()
    expect(result).toBe(redirect)
  })
})
