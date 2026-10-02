/** Loyalty and sign-in are keyed on Philippine mobiles only (the server enforces `^\+639\d{9}$`). */
const PH_MOBILE_E164 = /^\+639\d{9}$/

export function toPhilippineE164(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  const national = digits.startsWith('63') ? digits.slice(2) : digits.startsWith('0') ? digits.slice(1) : digits
  const candidate = `+63${national}`
  return PH_MOBILE_E164.test(candidate) ? candidate : null
}

export function formatPhoneForDisplay(e164: string): string {
  const national = e164.replace(/^\+63/, '')
  return `+63 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`
}
