/**
 * Shared shapes for the owner assistant ("the Owl").
 *
 * A tool answers in three parts. `facts` is the small JSON the MODEL reads;
 * `card` is the full render payload only the BROWSER gets (never re-sent to the
 * model — that split is the main token saving); `chips` are follow-up prompts
 * the tool writes deterministically, so suggesting "what next" costs no tokens.
 */

export type AssistantCard = StatsCard | RankedCard | BarsCard | ConfirmCard | LessonsCard

export interface StatsCard {
  type: 'stats'
  title: string
  subtitle?: string
  items: Array<{ label: string; value: string; change?: number | null; hint?: string }>
}

export interface RankedCard {
  type: 'ranked'
  title: string
  subtitle?: string
  rows: Array<{ label: string; value: string; detail?: string; badge?: string }>
  emptyText?: string
}

export interface BarsCard {
  type: 'bars'
  title: string
  subtitle?: string
  unit: 'orders' | 'sales'
  bars: Array<{ label: string; value: number; isHighlight?: boolean }>
}

/** A proposed change waiting for the owner's tap. Executed server-side from the stored payload. */
export interface ConfirmCard {
  type: 'confirm'
  actionId: string
  title: string
  lines: Array<{ label: string; value: string }>
  /** Shown above the buttons, e.g. "Goes live on your menu immediately". */
  warning?: string
  /** A picture the change uses (a payment QR), always one of our CDN's https URLs. */
  imageUrl?: string
  expiresAt: string
  /** Filled in when a past conversation is reopened: the proposal's outcome so far. */
  status?: string
}

/** SmartMenu University lessons that answer a "how do I…" question. */
export interface LessonsCard {
  type: 'lessons'
  title: string
  lessons: Array<{
    title: string
    /** "Inventory Management · 6 min" */
    detail: string
    /** Relative to /{tenant}/admin, e.g. /learn/getting-started/inventory. */
    path: string
    /** Iframe player URL (YouTube / Vimeo / Loom only) or null when the lesson has no video. */
    embedUrl: string | null
    watchUrl: string | null
    thumbnailUrl: string | null
  }>
}

/** A one-tap follow-up: tapping it sends `prompt` as the owner's next message. */
export interface AssistantChip {
  label: string
  prompt: string
}

/** A deep link into an admin screen, relative to /{tenant}/admin. */
export interface AssistantLink {
  label: string
  path: string
}

export interface ToolResult {
  facts: Record<string, unknown>
  card?: AssistantCard
  chips?: AssistantChip[]
  links?: AssistantLink[]
}
