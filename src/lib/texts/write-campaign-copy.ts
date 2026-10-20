/**
 * "Write it for me" for a campaign — the prompt and the gate. Pure.
 *
 * Same rules as the automation writer (sms-automations/write-copy.ts): a
 * draft reaches the owner only if every {{word}} is one a campaign can fill,
 * its own words invent nothing (no offers, numbers, prices, links, awards —
 * `INVENTED_CLAIM`), and it stays plain GSM-7 within two texts with long
 * sample values filled in.
 */

import type { ChatMessage } from '@/lib/ai/openrouter'
import { INVENTED_CLAIM, WRITE_OPTIONS, type WriteLanguage } from '@/lib/sms-automations/write-copy'
import { PLACEHOLDER_PATTERN, countSmsSegments, toSmsSafe } from '@/lib/sms-automations/template'
import { AUDIENCE_PRESET_FILTERS, audienceLabelOf } from './audience'
import { validateCampaignTemplate } from './message'
import type { AudiencePreset } from './types'

const MAX_SEGMENTS = 2
const SAMPLE_VALUE = 'Sample Value Here'
const PROMPT_WORDS = ['{{firstName}}', '{{storeName}}']

const AUDIENCE_WORDS: Readonly<Record<AudiencePreset, string>> = Object.freeze({
  everyone: 'every guest who agreed to texts',
  lapsed: `guests who have not ordered in ${AUDIENCE_PRESET_FILTERS.lapsed.lastOrderOlderThanDays}+ days`,
  regulars: `regulars with ${AUDIENCE_PRESET_FILTERS.regulars.minOrderCount}+ orders`,
  first_timers: 'guests who ordered exactly once',
  recent: `guests who ordered in the last ${AUDIENCE_PRESET_FILTERS.recent.lastOrderWithinDays} days`,
  custom: 'a group of the store\'s guests',
})

export interface CampaignWriteInput {
  name: string
  audiencePreset: AudiencePreset
  language: WriteLanguage
  storeName: string
}

const oneLine = (value: string, max: number): string => value.replace(/[\r\n]+/g, ' ').slice(0, max)

export function buildCampaignWritePrompt(input: CampaignWriteInput): ChatMessage[] {
  const language = input.language === 'tl' ? 'Taglish (casual Filipino-English mix, the way Manila diners text)' : 'simple, warm English'
  return [
    {
      role: 'system',
      content: [
        'You write short SMS messages a small restaurant sends to its own guests.',
        `Answer with JSON only: {"messages": ["…", "…", "…"]} — exactly ${WRITE_OPTIONS} different messages.`,
        'Rules: under 150 characters each; plain letters only (no emoji, no curly quotes); start with a greeting using {{firstName}};',
        'never invent offers, prices, discounts, numbers, links, awards or claims — only use the {{placeholders}} given.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Store: ${oneLine(input.storeName, 80)}`,
        `Campaign (the owner's own name for it): ${oneLine(input.name, 60)}`,
        `Who gets it: ${AUDIENCE_WORDS[input.audiencePreset]} (${audienceLabelOf(input.audiencePreset)})`,
        `Placeholders you may use: ${PROMPT_WORDS.join(', ')}`,
        `Language: ${language}`,
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

function isAcceptable(message: string): boolean {
  if (!validateCampaignTemplate(message).ok) return false
  if (INVENTED_CLAIM.test(message.replace(PLACEHOLDER_PATTERN, ' '))) return false
  const sample = countSmsSegments(message.replace(PLACEHOLDER_PATTERN, SAMPLE_VALUE))
  return sample.encoding === 'GSM7' && sample.segments <= MAX_SEGMENTS
}

/** The drafts worth showing, cleaned and de-duplicated; empty when none pass. */
export function acceptCampaignMessages(raw: string): string[] {
  const accepted: string[] = []
  for (const item of parseMessages(raw)) {
    if (typeof item !== 'string') continue
    const message = toSmsSafe(item).replace(/\s+/g, ' ').trim()
    if (!accepted.includes(message) && isAcceptable(message)) accepted.push(message)
  }
  return accepted.slice(0, WRITE_OPTIONS)
}
