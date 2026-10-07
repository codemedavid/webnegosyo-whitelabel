'use client'

import Link from 'next/link'
import { ArrowRight, ImageIcon, Loader2 } from 'lucide-react'
import type { UIMessage } from 'ai'
import { cn } from '@/lib/utils'
import type { AssistantChip, ToolResult } from '@/lib/assistant/types'
import { AssistantCardView } from './assistant-cards'
import { SafeTextView } from './safe-text-view'
import { ConfirmCardView } from './confirm-card'

/** What the owner sees while a tool runs. */
const TOOL_LABELS: Record<string, string> = {
  get_sales_overview: 'Checking your sales…',
  get_menu_insights: 'Looking at your menu…',
  search_menu: 'Searching your menu…',
  get_best_times: 'Checking your busy times…',
  get_item_pairs: 'Looking at what’s ordered together…',
  get_customers: 'Looking at your customers…',
  get_inventory: 'Checking your stock…',
  get_boost_ideas: 'Finding offer ideas…',
  get_staff_activity: 'Checking staff activity…',
  propose_offer: 'Preparing the offer…',
  propose_menu_item: 'Preparing the new dish…',
  propose_stock_adjustment: 'Preparing the stock update…',
  calc_promo_breakeven: 'Working out the break-even…',
  suggest_promotions: 'Looking for promotion ideas…',
  propose_sms_campaign: 'Drafting the SMS…',
  propose_voucher: 'Preparing the voucher…',
  get_orders_now: 'Checking today’s orders…',
  get_live_offers: 'Looking at your offers…',
  get_loyalty: 'Checking your loyalty program…',
  get_sms_campaigns: 'Checking your SMS campaigns…',
  get_vouchers: 'Checking your vouchers…',
  propose_offer_change: 'Preparing the offer change…',
  propose_cart_last_call: 'Preparing the cart offer…',
  propose_loyalty_program: 'Preparing the loyalty program…',
  propose_loyalty_status: 'Preparing the loyalty change…',
  propose_pause_sms_campaign: 'Preparing to pause the SMS…',
  propose_voucher_status: 'Preparing the voucher change…',
  propose_menu_item_change: 'Preparing the dish update…',
  propose_menu_from_photo: 'Reading your photo… this takes a moment',
  propose_menu_import_edit: 'Updating the dish list…',
}

interface ToolPartLike {
  type: string
  state?: string
  output?: unknown
}

function isToolPart(part: { type: string }): part is ToolPartLike {
  return part.type.startsWith('tool-')
}

function asToolResult(output: unknown): ToolResult | null {
  return output && typeof output === 'object' && 'facts' in output ? (output as ToolResult) : null
}

/** Photos the owner sent: the images themselves this session, only a count once reopened. */
function UserPhotos({ message }: { message: UIMessage }) {
  const urls = message.parts.flatMap((part) => (part.type === 'file' && part.mediaType.startsWith('image/') ? [part.url] : []))
  if (urls.length > 0) {
    return (
      <div className="flex justify-end gap-1.5">
        {urls.map((url, index) => (
          // eslint-disable-next-line @next/next/no-img-element -- a local data URL, not an optimisable asset
          <img key={index} src={url} alt={`Photo ${index + 1}`} className="h-20 w-20 rounded-xl object-cover ring-1 ring-border" />
        ))}
      </div>
    )
  }
  const marker = message.parts.find((part) => part.type === 'data-photos') as { data?: { count?: unknown } } | undefined
  const count = typeof marker?.data?.count === 'number' ? marker.data.count : 0
  if (count === 0) return null
  return (
    <p className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
      <ImageIcon className="h-3 w-3" aria-hidden />
      {count} photo{count === 1 ? '' : 's'} sent
    </p>
  )
}

/** Every follow-up chip in a message, de-duplicated, at most four. */
export function collectChips(message: UIMessage): AssistantChip[] {
  const seen = new Set<string>()
  return message.parts
    .flatMap((part) => (isToolPart(part) && part.state === 'output-available' ? (asToolResult(part.output)?.chips ?? []) : []))
    .filter((chip) => (seen.has(chip.prompt) ? false : (seen.add(chip.prompt), true)))
    .slice(0, 4)
}

interface AssistantMessageProps {
  message: UIMessage
  tenantId: string
  adminBasePath: string
  onNavigate: () => void
}

export function AssistantMessage({ message, tenantId, adminBasePath, onNavigate }: AssistantMessageProps) {
  if (message.role === 'user') {
    const text = message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join(' ')
    return (
      <div className="space-y-1.5">
        <UserPhotos message={message} />
        <div className="flex justify-end">
          <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-neutral-900 px-3.5 py-2 text-[14px] text-white">{text}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {message.parts.map((part, index) => {
        if (part.type === 'text') {
          return part.text.trim() ? <SafeTextView key={index} text={part.text} /> : null
        }
        if (!isToolPart(part)) return null
        const toolName = part.type.slice('tool-'.length)
        if (part.state === 'input-streaming' || part.state === 'input-available') {
          return (
            <p key={index} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {TOOL_LABELS[toolName] ?? 'Working on it…'}
            </p>
          )
        }
        if (part.state === 'output-error') {
          return (
            <p key={index} className="text-xs text-muted-foreground">
              That data couldn’t be loaded.
            </p>
          )
        }
        const result = asToolResult(part.output)
        if (!result) return null
        return (
          <div key={index} className="space-y-1.5">
            {result.card?.type === 'confirm' ? (
              <ConfirmCardView card={result.card} tenantId={tenantId} adminBasePath={adminBasePath} onNavigate={onNavigate} />
            ) : (
              <AssistantCardView card={result.card} />
            )}
            {result.links?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {result.links.map((link) => (
                  <Link
                    key={link.path}
                    href={`${adminBasePath}${link.path}`}
                    onClick={onNavigate}
                    className={cn('inline-flex items-center gap-1 text-xs font-semibold text-foreground/80 underline-offset-2 hover:underline')}
                  >
                    {link.label}
                    <ArrowRight className="h-3 w-3" aria-hidden />
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
