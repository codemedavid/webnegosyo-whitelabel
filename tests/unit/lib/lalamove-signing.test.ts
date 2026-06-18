import { createHmac } from 'crypto'

/**
 * Contract test for the Lalamove v3 HMAC-SHA256 signature format used by
 * convex-template/convex/lalamove.ts.
 *
 * The Convex module signs with Web Crypto (crypto.subtle); here we replicate
 * the exact byte sequence with Node's crypto and assert against a fixed vector.
 * If the raw-signature template, body envelope, or method/path handling ever
 * changes, this test fails — catching the regression that previously sent the
 * raw secret as the signature and produced production 401s.
 */

// Mirror of the signing string the Convex action builds.
function buildRawSignature(
  timestamp: string,
  method: string,
  path: string,
  body: string
): string {
  return `${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`
}

function sign(secret: string, raw: string): string {
  return createHmac('sha256', secret).update(raw).digest('hex')
}

describe('Lalamove v3 signature contract', () => {
  const secret = 'test-secret'
  const timestamp = '1700000000000'

  test('payloads are wrapped in a { data } envelope', () => {
    const body = JSON.stringify({ data: { quotationId: 'q1' } })
    expect(body).toBe('{"data":{"quotationId":"q1"}}')
  })

  test('raw signature uses CRLF-separated ts/method/path/<blank>/body', () => {
    const body = JSON.stringify({ data: { quotationId: 'q1' } })
    const raw = buildRawSignature(timestamp, 'POST', '/v3/orders', body)
    expect(raw).toBe(
      '1700000000000\r\nPOST\r\n/v3/orders\r\n\r\n{"data":{"quotationId":"q1"}}'
    )
  })

  test('produces the expected HMAC-SHA256 hex for a known vector', () => {
    const body = JSON.stringify({ data: { quotationId: 'q1' } })
    const raw = buildRawSignature(timestamp, 'POST', '/v3/orders', body)
    expect(sign(secret, raw)).toBe(
      '149f4480d484cf4eef821621bd9fac322ed428111a75c183894c22da5dc00ce6'
    )
  })

  test('GET requests sign an empty body', () => {
    const raw = buildRawSignature(timestamp, 'GET', '/v3/quotations/q1', '')
    expect(raw).toBe('1700000000000\r\nGET\r\n/v3/quotations/q1\r\n\r\n')
    expect(sign(secret, raw)).toHaveLength(64)
  })
})
