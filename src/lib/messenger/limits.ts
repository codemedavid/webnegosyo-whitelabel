/**
 * Meta's Messenger limits, in one place (checked 2026-11-10 against
 * developers.facebook.com/documentation/business-messaging/messenger-platform).
 *
 * Every reply builder clips to these, and `tests/unit/messenger/limits-contract`
 * walks every action over sample menus to prove nothing we build is refused.
 */

export const MESSENGER_LIMITS = {
  /** Generic template (carousel) elements per message. */
  cardElements: 10,
  /** Buttons on one card or one button template. */
  cardButtons: 3,
  cardTitle: 80,
  cardSubtitle: 80,
  buttonTitle: 20,
  quickReplies: 13,
  quickReplyTitle: 20,
  payload: 1000,
  /** Plain text message. */
  text: 2000,
  /** Text above a button template. */
  buttonTemplateText: 640,
  iceBreakers: 4,
  iceBreakerQuestion: 80,
  persistentMenuItems: 20,
  persistentMenuTitle: 30,
  greeting: 160,
} as const

/** Cut to `max` characters (code points, so an emoji is never split), ending in "…". */
export function clip(text: string, max: number): string {
  const chars = Array.from(text.trim())
  if (chars.length <= max) return chars.join('')
  return `${chars.slice(0, Math.max(0, max - 1)).join('').trimEnd()}…`
}

/** Code-point length, the way Meta counts characters. */
export function charLength(text: string): number {
  return Array.from(text).length
}
