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

/** What the code is for: a reward claim / rewards-page check, or a customer-app sign-in. */
export type OtpPurpose = 'claim' | 'wallet' | 'login'

/**
 * The message with `{otp}` where the code goes, as Semaphore's OTP route
 * expects, worded for its purpose. Unknown purposes read as rewards.
 */
export function otpTemplateFor(purpose: OtpPurpose | null | undefined, storeName: string | null | undefined): string {
  const store = cleanStoreName(storeName)
  const noun = purpose === 'login' ? 'sign-in code' : 'reward code'
  const subject = store ? `your ${store} ${noun}` : `your ${noun}`
  return `${OTP_PLACEHOLDER} is ${subject}. It expires in 5 minutes. Never share it with anyone.`
}

export function buildOtpMessage(purpose: OtpPurpose | null | undefined, storeName: string | null | undefined, code: string): string {
  if (typeof code !== 'string' || !/^[0-9]{6}$/.test(code)) throw new Error('Invalid loyalty code')
  return otpTemplateFor(purpose, storeName).replace(OTP_PLACEHOLDER, code)
}

export function loyaltyOtpTemplate(storeName: string | null | undefined): string {
  return otpTemplateFor('claim', storeName)
}

export function buildLoyaltyOtpMessage(storeName: string | null | undefined, code: string): string {
  return buildOtpMessage('claim', storeName, code)
}
