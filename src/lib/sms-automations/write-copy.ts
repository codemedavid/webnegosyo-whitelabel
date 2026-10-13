/**
 * "Write it for me" — the prompt and, mostly, the gate. Pure.
 *
 * The model drafts a few messages for one automation. A draft reaches the
 * owner only if:
 *   - every {{word}} is one this recipe can fill (validateAutomationMessage);
 *   - its own words promise nothing the store never said — no numbers,
 *     prices, percentages, links, "free", "best", awards (the launch-copy rule;
 *     a reward is named only through {{rewardName}});
 *   - it stays plain GSM-7 and at most two texts with sample values filled in.
 * Curly quotes and dashes are straightened rather than paid for.
 */

import type { ChatMessage } from '@/lib/ai/openrouter'
import { getRecipe, describeAutomation } from './recipes'
import { PLACEHOLDER_PATTERN, allowedVariables, countSmsSegments, toSmsSafe, validateAutomationMessage } from './template'
import type { RecipeId } from './types'

export const WRITE_OPTIONS = 3
const MAX_SEGMENTS = 2
/** Long enough for the longest values a placeholder realistically fills with. */
const SAMPLE_VALUE = 'Sample Value Here'
const SAMPLE_LINK = 'https://store.webnegosyo.com/menu'

const INVENTED_CLAIM = new RegExp(
  [
    String.raw`\p{Nd}|₱|%|#|https?:|www\.|@|\w\.[a-z]{2,}\b`,
    String.raw`\b(free|sale|discount|promo|deals?|bogo|buy one|off your|% off|guaranteed?|cheapest|lowest|unlimited|limited time|today only)\b`,
    String.raw`\b(rated|ratings?|stars?|awards?|award-winning|famous|legendary|since|established|number one|the best|best in|world[- ]class|michelin)\b`,
  ].join('|'),
  'iu',
)

export type WriteLanguage = 'en' | 'tl'

export function buildWritePrompt(input: { recipe: RecipeId; language: WriteLanguage; storeName: string }): ChatMessage[] {
  const recipe = getRecipe(input.recipe)
  const words = allowedVariables(input.recipe).map((name) => `{{${name}}}`).join(', ')
  const language = input.language === 'tl'
    ? 'Taglish (casual Filipino-English mix, the way Manila diners text)'
    : 'simple, warm English'
  return [
    {
      role: 'system',
      content: [
        'You write short SMS messages a small restaurant sends to its own guests.',
        `Answer with JSON only: {"messages": ["…", "…", "…"]} — exactly ${WRITE_OPTIONS} different messages.`,
        'Rules: under 150 characters each; plain letters only (no emoji, no curly quotes); start with a greeting using {{firstName}};',
        'never invent offers, prices, discounts, numbers, links, awards or claims — only use the {{placeholders}} given;',
        'end with the link placeholder when one fits.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Store: ${input.storeName.replace(/[\r\n]+/g, ' ').slice(0, 80)}`,
        `Moment: ${recipe.title} — ${describeAutomation(input.recipe, recipe.defaults)}. Why it matters: ${recipe.pitch}`,
        `Placeholders you may use: ${words}`,
        `Language: ${language}`,
        `Example of the tone: ${input.language === 'tl' ? recipe.defaultMessageTl : recipe.defaultMessage}`,
      ].join('\n'),
    },
  ]
}

function parseMessages(raw: string): unknown[] {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { messages?: unknown }
    return Array.isArray(parsed.messages) ? parsed.messages : []
  } catch {
    return []
  }
}

/** Long-ish sample values, so a draft that fits here fits for real guests. */
function withSampleValues(message: string): string {
  return message.replace(PLACEHOLDER_PATTERN, (_match, name: string) => (name.endsWith('Link') ? SAMPLE_LINK : SAMPLE_VALUE))
}

function isAcceptable(message: string, recipe: RecipeId): boolean {
  if (!validateAutomationMessage(recipe, message).ok) return false
  const ownWords = message.replace(PLACEHOLDER_PATTERN, ' ')
  if (INVENTED_CLAIM.test(ownWords)) return false
  const sample = countSmsSegments(withSampleValues(message))
  return sample.encoding === 'GSM7' && sample.segments <= MAX_SEGMENTS
}

/** The drafts worth showing, cleaned and de-duplicated; empty when none pass. */
export function acceptWrittenMessages(raw: string, recipe: RecipeId): string[] {
  const accepted: string[] = []
  for (const item of parseMessages(raw)) {
    if (typeof item !== 'string') continue
    const message = toSmsSafe(item).replace(/\s+/g, ' ').trim()
    if (accepted.includes(message) || !isAcceptable(message, recipe)) continue
    accepted.push(message)
  }
  return accepted.slice(0, WRITE_OPTIONS)
}
