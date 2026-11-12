/** Sign-in codes are six digits, like the SMS the store sends. */
export const CODE_LENGTH = 6
export const RESEND_COOLDOWN_SECONDS = 30
const NATIONAL_LENGTH = 10
const PROTOTYPE_WRONG_CODE = '000000'

/** Digits only, at most six — so a pasted "Your code is 482913." fills the boxes. */
export function sanitizeCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, CODE_LENGTH)
}

export function isCompleteCode(code: string): boolean {
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)
}

/** Prototype stand-in for the server check (Phase 3): 000000 plays the wrong code. */
export function isPrototypeCodeAccepted(code: string): boolean {
  return isCompleteCode(code) && code !== PROTOTYPE_WRONG_CODE
}

/** Whole seconds until "Resend code" unlocks; rounds up so it never reads 0 while still locked. */
export function resendSecondsLeft(sentAtMs: number, nowMs: number, cooldownSeconds = RESEND_COOLDOWN_SECONDS): number {
  const remainingMs = sentAtMs + cooldownSeconds * 1000 - nowMs
  return Math.max(0, Math.ceil(remainingMs / 1000))
}

export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

/**
 * What the phone field holds after the fixed +63 prefix: the ten national
 * digits, whether the customer typed 0917…, 63917… or pasted +63 917….
 */
export function nationalDigits(input: string): string {
  const digits = input.replace(/\D/g, '')
  const withoutCountry = digits.startsWith('63') && digits.length > NATIONAL_LENGTH ? digits.slice(2) : digits
  const withoutTrunk = withoutCountry.startsWith('0') ? withoutCountry.slice(1) : withoutCountry
  return withoutTrunk.slice(0, NATIONAL_LENGTH)
}

/** "+63 917 ••• 4567" — enough to recognise your own number over someone's shoulder. */
export function maskPhone(e164: string): string {
  const national = e164.replace(/^\+63/, '')
  return `+63 ${national.slice(0, 3)} ••• ${national.slice(6)}`
}
