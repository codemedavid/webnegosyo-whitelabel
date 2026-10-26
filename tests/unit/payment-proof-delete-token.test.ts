/** @jest-environment node */
/**
 * Only whoever uploaded a payment-proof screenshot may delete it. The upload
 * route hands back an HMAC of the file id (over API_SECRET, its own context);
 * the delete route needs it. A file id alone — readable on any order screen —
 * no longer deletes a customer's proof.
 */
import { signProofDeleteToken, verifyProofDeleteToken } from '@/lib/payment-proof-delete-token'

const SECRET = 'test-secret'

describe('payment-proof delete token', () => {
  test('a token verifies for the file it was minted for', () => {
    const token = signProofDeleteToken('file-1', SECRET)

    expect(token).toEqual(expect.any(String))
    expect(verifyProofDeleteToken('file-1', token, SECRET)).toBe(true)
  })

  test('a token for one file does not delete another', () => {
    const token = signProofDeleteToken('file-1', SECRET)

    expect(verifyProofDeleteToken('file-2', token, SECRET)).toBe(false)
  })

  test('a token minted with another secret is refused', () => {
    const token = signProofDeleteToken('file-1', 'other-secret')

    expect(verifyProofDeleteToken('file-1', token, SECRET)).toBe(false)
  })

  test.each([[undefined], [null], [''], ['not-a-token'], [42]])('refuses %p', (token) => {
    expect(verifyProofDeleteToken('file-1', token, SECRET)).toBe(false)
  })

  test('without a secret nothing is minted and nothing verifies', () => {
    expect(signProofDeleteToken('file-1', null)).toBeNull()
    expect(verifyProofDeleteToken('file-1', signProofDeleteToken('file-1', SECRET), null)).toBe(false)
  })

  test('is not the delivery-quote or tracking signature (own context)', () => {
    const crypto = jest.requireActual<typeof import('crypto')>('crypto')
    const bare = crypto.createHmac('sha256', SECRET).update('file-1').digest('base64url')

    expect(signProofDeleteToken('file-1', SECRET)).not.toBe(bare)
  })
})
