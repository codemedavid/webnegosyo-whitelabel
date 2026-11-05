'use client'

/**
 * The Messenger hand-off card and the collapsible order message. Markup is
 * today's, verbatim; wording comes in as props so a designed page can
 * re-word it (the standard page passes nothing).
 */

import { Copy, ExternalLink } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { useConfirmationBlocks } from './confirmation-context'
import { CountdownText } from './countdown-text'

const CARD = 'rounded-2xl bg-[var(--co-card)] p-6 shadow-sm border border-[color:var(--co-border)]'
/** Today's button corners; a designed page may pass another shape. */
const PILL = 'rounded-full'
const outlineButton = (shape: string): string =>
  `w-full h-12 ${shape} border-[color:var(--co-accent-border)] bg-transparent text-[color:var(--co-accent)] hover:bg-[var(--co-accent-softer)] hover:text-[color:var(--co-accent)]`
const COPIED_TO_MESSENGER = 'Order message copied! Paste it in Messenger.'

export interface MessengerCopy {
  countdown?: string
  opened?: string
  button?: string
  or?: string
  copyLink?: string
  noPage?: string
  copyButton?: string
  messageTitle?: string
  messageHint?: string
}

/** Page Designer switches for the Messenger card's fallback lines; unset = shown, as today. */
export interface MessengerShow {
  /** The "or" divider under the Messenger button. */
  orLine?: boolean
  /** "Copy order text and paste it directly on Messenger". */
  copyLink?: boolean
}

/** Messenger off for this order: the "sent, nothing else to do" card. */
function NoMessengerBody() {
  const b = useConfirmationBlocks()
  if (!b) return null
  return (
    <div className="space-y-2 text-center">
      {b.hasOrderSaveFailed ? (
        <p data-part="text" className="text-sm font-medium text-[color:var(--co-text)]">
          This order did not reach {b.storeName}. Please contact them directly.
        </p>
      ) : (
        <>
          <p data-part="text" className="text-sm font-medium text-[color:var(--co-text)]">Your order has been sent to {b.storeName}.</p>
          <p data-part="muted" className="text-sm text-[color:var(--co-muted)]">They&apos;ll confirm it shortly — no further action needed.</p>
        </>
      )}
    </div>
  )
}

function MessengerLinkBody({ copy, shape, show = {} }: { copy: MessengerCopy; shape: string; show?: MessengerShow }) {
  const b = useConfirmationBlocks()
  if (!b) return null
  const { orLine: showOrLine = true, copyLink: showCopyLink = true } = show
  const isCounting = b.messengerCountdown !== null && b.messengerCountdown > 0
  return (
    <div className="space-y-4">
      {/* Countdown redirect indicator */}
      <div className="text-center space-y-2">
        {isCounting ? (
          <>
            <div className="inline-flex items-center justify-center w-10 h-10 border-2 border-[color:var(--co-accent)] border-t-transparent rounded-full animate-spin mx-auto" />
            <p data-part="muted" className="text-sm text-[color:var(--co-muted)]">
              <CountdownText text={copy.countdown ?? 'Redirecting to Messenger in {seconds}...'} seconds={b.messengerCountdown} />
            </p>
          </>
        ) : (
          <p data-part="muted" className="text-sm text-[color:var(--co-muted)]">
            {copy.opened ?? 'Messenger should have opened in a new tab.'}
          </p>
        )}
      </div>

      <Button
        size="lg"
        data-part="button"
        className={`w-full h-12 bg-[var(--co-button)] hover:bg-[var(--co-button)] hover:opacity-90 text-[color:var(--co-accent-text)] font-semibold ${shape}`}
        onClick={b.onOpenMessenger}
      >
        <ExternalLink className="mr-2 h-5 w-5" />
        {copy.button ?? 'Go to Messenger'}
      </Button>

      {/* Copy fallback */}
      {showOrLine && (
        <div className="relative text-center">
          <div className="absolute inset-0 flex items-center">
            <span data-part="divider" className="w-full border-t border-[color:var(--co-border)]" />
          </div>
          <span data-part="muted" className="relative bg-[var(--co-card)] px-3 text-xs text-[color:var(--co-muted)]">{copy.or ?? 'or'}</span>
        </div>
      )}

      {showCopyLink && (
        <button
          data-part="link"
          className="w-full text-sm text-[color:var(--co-accent)] hover:underline py-1"
          onClick={() => b.onCopyMessage(COPIED_TO_MESSENGER)}
        >
          <Copy className="inline mr-1.5 h-3.5 w-3.5" />
          {copy.copyLink ?? 'Copy order text and paste it directly on Messenger'}
        </button>
      )}
    </div>
  )
}

function CopyOnlyBody({ copy, shape }: { copy: MessengerCopy; shape: string }) {
  const b = useConfirmationBlocks()
  if (!b) return null
  return (
    <div className="space-y-3 text-center">
      <p data-part="muted" className="text-sm text-[color:var(--co-muted)]">
        {copy.noPage ?? 'Copy the order message and send it to the restaurant.'}
      </p>
      <Button size="lg" variant="outline" data-part="button-alt" className={outlineButton(shape)} onClick={() => b.onCopyMessage(COPIED_TO_MESSENGER)}>
        <Copy className="mr-2 h-5 w-5" />
        {copy.copyButton ?? 'Copy Order Message'}
      </Button>
    </div>
  )
}

/** Messenger Redirect Section — the "no Messenger" card when the order type has it off. */
export function ConfirmationMessengerCard({ copy = {}, shape = PILL, show }: { copy?: MessengerCopy; shape?: string; show?: MessengerShow }) {
  const b = useConfirmationBlocks()
  if (!b) return null
  const body = !b.isMessengerEnabled
    ? <NoMessengerBody />
    : b.order.messengerUrl ? <MessengerLinkBody copy={copy} shape={shape} show={show} /> : <CopyOnlyBody copy={copy} shape={shape} />
  return <div data-branding-scope="checkout/card" data-part="card" className={CARD}>{body}</div>
}

/** Order Message Box (collapsible). */
export function ConfirmationMessageBox({ copy = {}, shape = PILL }: { copy?: MessengerCopy; shape?: string }) {
  const b = useConfirmationBlocks()
  if (!b) return null
  const hint = b.isMessengerEnabled
    ? copy.messageHint ?? 'Paste this in Messenger or any chat app'
    : 'A copy of your order for your records'
  return (
    <div data-branding-scope="checkout/card" data-part="card" className="rounded-2xl bg-[var(--co-card)] shadow-sm border border-[color:var(--co-border)] overflow-hidden">
      <button
        onClick={b.onToggleMessage}
        aria-expanded={b.isMessageExpanded}
        className="w-full flex items-center justify-between p-6 text-left hover:bg-[var(--co-subtle)] transition-colors"
      >
        <h2 data-part="title" className="text-lg font-bold text-[color:var(--co-text)]">{copy.messageTitle ?? 'Order Message'}</h2>
        <span data-part="link" className="text-sm text-[color:var(--co-muted)]">{b.isMessageExpanded ? 'Hide' : 'Show'}</span>
      </button>

      {b.isMessageExpanded && (
        <div className="px-6 pb-6 space-y-3">
          <div data-part="field" className="bg-[var(--co-subtle)] rounded-xl p-4 max-h-64 overflow-y-auto">
            <pre data-part="text" className="text-sm text-[color:var(--co-text)] whitespace-pre-wrap font-sans leading-relaxed">
              {b.order.messengerMessage}
            </pre>
          </div>

          <Button size="lg" variant="outline" data-part="button-alt" className={outlineButton(shape)} onClick={() => b.onCopyMessage('Order message copied to clipboard!')}>
            <Copy className="mr-2 h-5 w-5" />
            {copy.copyButton ?? 'Copy Order Message'}
          </Button>

          <p data-part="muted" className="text-xs text-[color:var(--co-muted)] text-center">{hint}</p>
        </div>
      )}
    </div>
  )
}
