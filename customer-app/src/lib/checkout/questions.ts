import type { AppCheckoutQuestion } from '@/lib/contract'

/**
 * The store's own checkout questions (`catalog.questions`), as the review
 * screen asks them. The server answers name, phone and address questions
 * itself; these are the rest ("Pickup date", "Table number", "Which gate?").
 * Answers are kept per question id and sent under each question's `name`.
 *
 * Presence only, like the server: the store's format rules stay on the web.
 */

/** What a ticked tick box sends (the web's `CHECKBOX_TICKED`). */
export const TICKED = 'yes'

/** How many days ahead a date question offers. */
export const DATE_CHOICES = 14

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type QuestionAnswers = Readonly<Record<string, string>>

export function questionsFor(questions: readonly AppCheckoutQuestion[] | undefined, orderTypeId: string | undefined): AppCheckoutQuestion[] {
  if (!questions || !orderTypeId) return []
  return questions.filter((question) => question.orderTypeId === orderTypeId)
}

export function isQuestionAnswered(question: Pick<AppCheckoutQuestion, 'type'>, value: string | undefined): boolean {
  const trimmed = value?.trim() ?? ''
  return question.type === 'checkbox' ? trimmed === TICKED : trimmed !== ''
}

/** What the place-order bar says about a required question left blank. */
export function questionBlocker(question: Pick<AppCheckoutQuestion, 'type' | 'label'>): string {
  return question.type === 'checkbox' ? `Tick “${question.label}”` : `Answer “${question.label}”`
}

/** Required questions still unanswered, in form order, as blocker sentences. */
export function unansweredQuestions(questions: readonly AppCheckoutQuestion[], answers: QuestionAnswers): string[] {
  return questions.filter((question) => question.isRequired && !isQuestionAnswered(question, answers[question.id])).map(questionBlocker)
}

/** The draft's `answers`: by question name, answered ones only. Undefined = nothing to send. */
export function answersToSend(questions: readonly AppCheckoutQuestion[], answers: QuestionAnswers): Record<string, string> | undefined {
  const sent: Record<string, string> = {}
  for (const question of questions) {
    const value = answers[question.id]
    if (isQuestionAnswered(question, value)) sent[question.name] = (value ?? '').trim()
  }
  return Object.keys(sent).length > 0 ? sent : undefined
}

export interface DateChoice {
  /** `YYYY-MM-DD`, what the web's date input stores. */
  value: string
  /** "Today", "Tomorrow", "Fri 14 Nov". */
  label: string
}

const pad = (value: number) => String(value).padStart(2, '0')

/** The next `count` days in Manila (where every store is), starting today. */
export function upcomingDays(nowMs: number, count = DATE_CHOICES): DateChoice[] {
  const manilaMidnight = Math.floor((nowMs + MANILA_OFFSET_MS) / DAY_MS) * DAY_MS
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(manilaMidnight + index * DAY_MS)
    const value = `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`
    const label =
      index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : `${WEEKDAYS[day.getUTCDay()]} ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}`
    return { value, label }
  })
}
