/** @jest-environment node */
jest.mock('server-only', () => ({}))
import { getLoyaltyTrustedIp } from '@/lib/loyalty/public-ingress'

const env = { VERCEL: '1', LOYALTY_PUBLIC_TRUSTED_INGRESS: 'vercel' }

it.each(['203.0.113.4', '2001:db8::1', '::ffff:203.0.113.4'])(
  'accepts a single Vercel ingress address: %s', ip => {
    expect(getLoyaltyTrustedIp(new Headers({ 'x-vercel-forwarded-for': ip }), env)).toBe(ip)
  },
)

it.each([
  {}, { VERCEL: '1' }, { LOYALTY_PUBLIC_TRUSTED_INGRESS: 'vercel' },
  { VERCEL: '0', LOYALTY_PUBLIC_TRUSTED_INGRESS: 'vercel' },
  { VERCEL: '1', LOYALTY_PUBLIC_TRUSTED_INGRESS: 'cloudflare' },
])('requires explicit ingress configuration and Vercel runtime: %j', config => {
  expect(getLoyaltyTrustedIp(new Headers({ 'x-vercel-forwarded-for': '203.0.113.4' }), config)).toBeNull()
})

it.each(['', 'unknown', '203.0.113.4, 192.0.2.1', '203.0.113.4:1234', '[2001:db8::1]', 'fe80::1%en0'])(
  'rejects malformed, chained, port-qualified and scoped addresses: %s', ip => {
    expect(getLoyaltyTrustedIp(new Headers({ 'x-vercel-forwarded-for': ip }), env)).toBeNull()
  },
)

it('never falls back to client-controlled proxy headers', () => {
  expect(getLoyaltyTrustedIp(new Headers({
    'x-forwarded-for': '203.0.113.4', 'x-real-ip': '203.0.113.4', 'cf-connecting-ip': '203.0.113.4',
  }), env)).toBeNull()
})
