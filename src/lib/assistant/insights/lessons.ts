/**
 * Which SmartMenu University lessons answer a "how do I…" question. Pure.
 *
 * Lesson titles are short and Taglish ("Payment Methods Management",
 * "Connecting Sa Printer"), and owners ask in their own words ("paano
 * maglagay ng GCash"), so a question's words are widened through a small
 * topic table before they are matched against title, summary, module and
 * course. Only published lessons are ever passed in.
 */

import { foldName } from '@/lib/assistant/insights/menu-import'

export interface LessonCandidate {
  id: string
  slug: string
  courseSlug: string
  title: string
  summary: string | null
  moduleTitle: string
  courseTitle: string
  videoUrl: string | null
  durationMinutes: number | null
}

/** A topic word → the words a lesson about it uses. Folded, singular. */
const TOPICS: ReadonlyArray<readonly [readonly string[], readonly string[]]> = [
  [['gcash', 'maya', 'paymaya', 'bayad', 'payment', 'pay', 'qr', 'bank', 'transfer', 'cash'], ['payment']],
  [['inventory', 'stock', 'ingredient', 'sangkap', 'recipe', 'stocktake', 'count', 'waste', 'delivery'], ['inventory']],
  [['printer', 'print', 'bluetooth', 'thermal'], ['printer']],
  [['receipt', 'resibo'], ['receipt']],
  [['staff', 'cashier', 'employee', 'empleyado', 'account', 'team', 'crew', 'tauhan'], ['staff', 'account']],
  [['pos', 'register', 'walk', 'counter', 'kahera'], ['pos', 'walk']],
  [['app', 'download', 'install', 'phone', 'android', 'iphone'], ['app', 'download']],
  [['design', 'color', 'kulay', 'logo', 'brand', 'branding', 'theme', 'look'], ['branding']],
  [['report', 'analytics', 'sales', 'benta', 'kita'], ['analytics', 'report']],
  [['item', 'product', 'dish', 'menu', 'photo', 'image', 'picture', 'litrato', 'ulam'], ['item', 'product', 'image']],
  [['order', 'first', 'unang'], ['order']],
  [['pc', 'computer', 'laptop', 'desktop', 'browser'], ['pc']],
  [['senior', 'pwd', 'discount', 'vat', 'bir', 'sales book'], ['senior', 'pwd', 'discount']],
  [['pin', 'approval', 'manager'], ['approval', 'pin']],
  [['voucher', 'promo', 'code'], ['voucher']],
]

const STOP = new Set(['how', 'do', 'i', 'to', 'the', 'a', 'an', 'my', 'sa', 'ng', 'ang', 'mag', 'paano', 'po', 'yung', 'ko', 'mo', 'na', 'and', 'add', 'set', 'up', 'use', 'is', 'what', 'saan', 'video', 'lesson', 'tutorial'])

function words(text: string): string[] {
  return foldName(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOP.has(word))
    .map((word) => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word))
}

function widened(question: string): Set<string> {
  const asked = new Set(words(question))
  const joined = ` ${foldName(question)} `
  for (const [triggers, adds] of TOPICS) {
    if (triggers.some((trigger) => asked.has(trigger) || joined.includes(` ${trigger} `))) for (const add of adds) asked.add(add)
  }
  return asked
}

/** Up to `limit` lessons, best first; empty when nothing really matches. */
export function rankLessons(question: string, lessons: readonly LessonCandidate[], limit = 3): LessonCandidate[] {
  const asked = widened(question)
  if (asked.size === 0) return []
  const scored = lessons.map((lesson, index) => {
    const title = new Set(words(lesson.title))
    const rest = new Set(words(`${lesson.summary ?? ''} ${lesson.moduleTitle} ${lesson.courseTitle}`))
    let score = 0
    for (const word of asked) {
      if (title.has(word)) score += 3
      else if (rest.has(word)) score += 1
    }
    // A lesson someone can watch beats a text-only one on a tie.
    return { lesson, index, score: score + (score > 0 && lesson.videoUrl ? 0.5 : 0) }
  })
  return scored
    .filter((entry) => entry.score >= 3)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.lesson)
}
