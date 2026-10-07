/**
 * The one sentence every loyalty reward code is sent as, whichever transport
 * carries it (the store's own phone or Semaphore).
 *
 * The code comes FIRST: Semaphore silently drops any message that starts with
 * "TEST", and a store literally named "Test Kitchen" would otherwise never
 * receive a single code. The store name is cleaned because it is merchant
 * text: braces could forge Semaphore's `{otp}` placeholder and a newline would
 * break the one-line SMS.
 */

export const OTP_PLACEHOLDER = '{otp}'
export const OTP_STORE_NAME_MAX = 30

function cleanStoreName(name: string | null | undefined): string {
  if (typeof name !== 'string') return ''
  return name
    .replace(/[{}\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, OTP_STORE_NAME_MAX)
    .trim()
}

/** The message with `{otp}` where the code goes, as Semaphore's OTP route expects. */
export function loyaltyOtpTemplate(storeName: string | null | undefined): string {
  const store = cleanStoreName(storeName)
  const subject = store ? `your ${store} reward code` : 'your reward code'
  return `${OTP_PLACEHOLDER} is ${subject}. It expires in 5 minutes. Never share it with anyone.`
}

export function buildLoyaltyOtpMessage(storeName: string | null | undefined, code: string): string {
  if (typeof code !== 'string' || !/^[0-9]{6}$/.test(code)) throw new Error('Invalid loyalty code')
  return loyaltyOtpTemplate(storeName).replace(OTP_PLACEHOLDER, code)
}
