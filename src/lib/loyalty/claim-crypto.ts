// Node/server-only cryptographic boundary. Never send these keys to a handset.
import 'server-only'
import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'

type ChallengeContext = { tenantId: string; challengeId: string }
type ClaimKeys = { hashKey: Buffer; encryptionKey: Buffer }
type SmsPayload = { phone: string; code: string }

function uuid(value: string): string {
  if (typeof value !== 'string' || value.length !== 36 || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) {
    throw new Error('Invalid loyalty identity')
  }
  return value.toLowerCase()
}

function validateCode(code: string) {
  if (typeof code !== 'string' || code.length !== 6 || !/^[0-9]{6}$/.test(code)) throw new Error('Invalid loyalty code')
}

function validatePhone(phone: string) {
  if (typeof phone !== 'string' || phone.length !== 13 || !/^\+639[0-9]{9}$/.test(phone)) throw new Error('Invalid loyalty phone')
}

function canonicalIp(ip: string): string {
  if (typeof ip !== 'string' || ip.length > 45 || ip.includes('%') || !isIP(ip)) throw new Error('Invalid loyalty network identity')
  if (isIP(ip) === 4) return ip
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1)
  const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(canonical)
  if (!mapped) return canonical
  const high = parseInt(mapped[1], 16)
  const low = parseInt(mapped[2], 16)
  return [high >> 8, high & 255, low >> 8, low & 255].join('.')
}

export function createLoyaltyClaimCrypto(keys: ClaimKeys) {
  if (!Buffer.isBuffer(keys.hashKey) || keys.hashKey.length !== 32 ||
      !Buffer.isBuffer(keys.encryptionKey) || keys.encryptionKey.length !== 32 ||
      keys.hashKey.equals(keys.encryptionKey)) throw new Error('Independent 32-byte loyalty keys required')
  const hashKey = Buffer.from(keys.hashKey)
  const encryptionKey = Buffer.from(keys.encryptionKey)
  const digest = (purpose: string, values: string[]) => createHmac('sha256', hashKey)
    .update(JSON.stringify(['loyalty-v1', purpose, ...values])).digest('hex')
  const smsContext = (context: ChallengeContext) => Buffer.from(JSON.stringify([
    'loyalty-sms-v1', uuid(context.tenantId), uuid(context.challengeId),
  ]))

  return {
    generateCode(): string {
      return randomInt(0, 1_000_000).toString().padStart(6, '0')
    },
    // Global (not tenant-scoped) so one IP cannot reset its budget by switching
    // tenants. The caller must obtain this address from a trusted ingress.
    hashIp(ip: string): string {
      return digest('request-ip', [canonicalIp(ip)])
    },
    hashCode(context: ChallengeContext, code: string): string {
      validateCode(code)
      return digest('otp', [uuid(context.tenantId), uuid(context.challengeId), code])
    },
    hashPhone(tenantId: string, phone: string): string {
      validatePhone(phone)
      return digest('phone', [uuid(tenantId), phone])
    },
    // Build these together on the server; never accept request-supplied hashes
    // or customer keys as proof. Only hashes belong in challenge storage.
    verificationProof(context: ChallengeContext, phone: string, code: string) {
      validatePhone(phone)
      validateCode(code)
      const tenant = uuid(context.tenantId)
      return {
        customerKey: `phone:${phone}`,
        phoneHash: digest('phone', [tenant, phone]),
        codeHash: digest('otp', [tenant, uuid(context.challengeId), code]),
      }
    },
    createClaim(tenantId: string): { token: string; tokenHash: string } {
      const tenant = uuid(tenantId)
      const reference = randomBytes(32).toString('base64url')
      const token = `v1.${reference}.${digest('claim-signature', [tenant, reference])}`
      return { token, tokenHash: digest('claim-lookup', [tenant, token]) }
    },
    // Signature validation is NOT authorization. The database must also check
    // expiry, reward eligibility and atomically mark this claim used at reserve.
    resolveClaim(tenantId: string, token: unknown): string | null {
      const tenant = uuid(tenantId)
      if (typeof token !== 'string' || token.length !== 111 || !/^v1\.[A-Za-z0-9_-]{43}\.[a-f0-9]{64}$/.test(token)) return null
      const [, reference, signature] = token.split('.')
      const expected = digest('claim-signature', [tenant, reference])
      if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) return null
      return digest('claim-lookup', [tenant, token])
    },
    encryptSms(context: ChallengeContext, payload: SmsPayload): string {
      validatePhone(payload.phone)
      validateCode(payload.code)
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv)
      cipher.setAAD(smsContext(context))
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify({ phone: payload.phone, code: payload.code }), 'utf8'), cipher.final(),
      ])
      return ['v1', iv.toString('base64url'), ciphertext.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.')
    },
    // Only a server worker may decrypt, after checking the device's live lease
    // and challenge expiry. This function does not authorize SMS delivery.
    decryptSms(context: ChallengeContext, encrypted: unknown): SmsPayload {
      try {
        if (typeof encrypted !== 'string' || encrypted.length > 4096 || !/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$/.test(encrypted)) throw new Error()
        const [, iv, ciphertext, tag] = encrypted.split('.')
        if ([iv, ciphertext, tag].some(value => Buffer.from(value, 'base64url').toString('base64url') !== value)) throw new Error()
        const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(iv, 'base64url'))
        decipher.setAAD(smsContext(context))
        decipher.setAuthTag(Buffer.from(tag, 'base64url'))
        const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()])
        const payload = JSON.parse(plaintext.toString('utf8'))
        validatePhone(payload.phone)
        validateCode(payload.code)
        return { phone: payload.phone, code: payload.code }
      } catch {
        throw new Error('Invalid loyalty SMS payload')
      }
    },
  }
}
