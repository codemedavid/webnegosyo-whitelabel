import { baseSlugFromName } from '@/lib/onboarding/plan'

/** The sign-up link's questions, one a screen, in the order they are asked. */

export interface JoinFields {
  name: string
  business_name: string
  email: string
  phone: string
}

export type JoinKey = keyof JoinFields

export interface JoinQuestion {
  key: JoinKey
  title: string
  lede: string
  type: 'text' | 'email' | 'tel'
  autoComplete: string
  placeholder: string
  inputMode?: 'text' | 'email' | 'tel'
}

export const EMPTY_JOIN: JoinFields = { name: '', business_name: '', email: '', phone: '' }

export const JOIN_QUESTIONS: readonly JoinQuestion[] = [
  { key: 'business_name', title: "What's your store called?", lede: 'Watch it go up on your own link.', type: 'text', autoComplete: 'organization', placeholder: "Juan's Kitchen" },
  { key: 'name', title: 'And who runs it?', lede: 'Your name, so we know who to cheer for.', type: 'text', autoComplete: 'name', placeholder: 'Juan dela Cruz' },
  { key: 'email', title: 'Where do we reach you?', lede: 'This email becomes your login.', type: 'email', autoComplete: 'email', placeholder: 'juan@example.com', inputMode: 'email' },
  { key: 'phone', title: 'Last one: your mobile number', lede: 'For order alerts and help when you need it.', type: 'tel', autoComplete: 'tel', placeholder: '0917 123 4567', inputMode: 'tel' },
]

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_NAME_LENGTH = 2
const PH_MOBILE_DIGITS = 11

/** "+63 917 123 4567" and "0917-123-4567" both count as 09171234567. */
function phMobileDigits(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits.startsWith('63') ? `0${digits.slice(2)}` : digits
}

/** Why an answer can't be accepted yet, or null when it can. The server re-validates everything. */
export function joinFieldError(key: JoinKey, value: string): string | null {
  const trimmed = value.trim()
  if (key === 'email') return EMAIL_PATTERN.test(trimmed) ? null : 'Enter an email like juan@example.com'
  if (key === 'phone') {
    const digits = phMobileDigits(trimmed)
    return digits.length === PH_MOBILE_DIGITS && digits.startsWith('09') ? null : 'Enter an 11-digit mobile number, like 0917 123 4567'
  }
  return trimmed.length >= MIN_NAME_LENGTH ? null : key === 'name' ? 'Tell us your name' : 'Tell us your store name'
}

/** The question a server refusal is about (e.g. a taken email), or -1 when it is about none. */
export function questionIndexFor(field: string | null): number {
  return field === null ? -1 : JOIN_QUESTIONS.findIndex((question) => question.key === field)
}

/** The first question still unanswered (or the last one, when all are). */
export function firstOpenQuestion(fields: JoinFields): number {
  const index = JOIN_QUESTIONS.findIndex((question) => joinFieldError(question.key, fields[question.key]) !== null)
  return index < 0 ? JOIN_QUESTIONS.length - 1 : index
}

/**
 * The link their store will most likely get, built by the same slug rule the
 * build uses. The build adds "-2" when the name is taken, so the page says "about".
 */
export function previewStoreLink(businessName: string, rootDomain: string): string {
  const slug = businessName.trim() ? baseSlugFromName(businessName) : 'your-store'
  return rootDomain ? `${slug}.${rootDomain}` : slug
}
