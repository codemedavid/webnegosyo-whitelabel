'use client'

/**
 * The inside of the Studio's phone: a Messenger-looking thread of sample or
 * test-chat turns. Only this part uses Messenger's own colours (it is Meta's
 * app); everything around the phone uses the admin's tokens. It renders the
 * very messages the webhook sends.
 */

import type { ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import type { CardElement, MessengerButton, OutgoingMessage, QuickReply } from '@/lib/messenger/graph-message'
import type { Turn } from '@/lib/messenger/studio-scenarios'

export type TapTarget =
  | { kind: 'button'; button: MessengerButton }
  | { kind: 'quick'; reply: QuickReply }

interface TapProps {
  /** Test chat: buttons and quick replies answer. Without it they are pictures. */
  onTap?: (target: TapTarget) => void
}

function BubbleButton({ button, onTap }: { button: MessengerButton } & TapProps) {
  const content = (
    <>
      <span className="truncate">{button.title}</span>
      {button.type === 'web_url' ? <ExternalLink className="h-3 w-3 shrink-0" aria-hidden /> : null}
    </>
  )
  const className = 'flex w-full items-center justify-center gap-1 border-t border-[#E5E5E5] px-3 py-2 text-center text-[13px] font-semibold text-[#0866FF]'
  return onTap ? (
    <button type="button" className={`${className} hover:bg-[#F5F8FF]`} onClick={() => onTap({ kind: 'button', button })}>{content}</button>
  ) : (
    <div className={className}>{content}</div>
  )
}

function Card({ card, onTap }: { card: CardElement } & TapProps) {
  return (
    <div className="w-[208px] shrink-0 overflow-hidden rounded-[18px] border border-[#E5E5E5] bg-white">
      {card.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote menu photos, shown as Messenger shows them
        <img src={card.imageUrl} alt="" className="aspect-[1.91/1] w-full bg-neutral-100 object-cover" />
      ) : null}
      <div className="space-y-0.5 px-3 py-2">
        <p className="line-clamp-2 text-[13px] font-semibold text-[#111]">{card.title}</p>
        {card.subtitle ? <p className="line-clamp-2 text-[12px] text-[#65676B]">{card.subtitle}</p> : null}
      </div>
      {card.buttons.map((button, index) => <BubbleButton key={index} button={button} onTap={onTap} />)}
    </div>
  )
}

function BotMessage({ message, onTap }: { message: OutgoingMessage } & TapProps) {
  switch (message.kind) {
    case 'text':
      return <p className="max-w-[82%] self-start whitespace-pre-line rounded-[18px] rounded-bl-[6px] bg-[#F0F0F0] px-3 py-2 text-[13px] text-[#111]">{message.text}</p>
    case 'buttons':
      return (
        <div className="w-[228px] self-start overflow-hidden rounded-[18px] border border-[#E5E5E5] bg-white">
          <p className="whitespace-pre-line px-3 py-2 text-[13px] text-[#111]">{message.text}</p>
          {message.buttons.map((button, index) => <BubbleButton key={index} button={button} onTap={onTap} />)}
        </div>
      )
    case 'cards':
      return (
        <div className="-mx-3 flex max-w-none gap-2 self-stretch overflow-x-auto px-3 pb-1">
          {message.cards.map((card, index) => <Card key={index} card={card} onTap={onTap} />)}
        </div>
      )
  }
}

function QuickReplies({ replies, onTap }: { replies: readonly QuickReply[] } & TapProps) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5 self-stretch pt-0.5">
      {replies.map((reply, index) =>
        onTap ? (
          <button key={index} type="button" onClick={() => onTap({ kind: 'quick', reply })}
            className="min-h-8 rounded-full border border-[#0866FF] px-3 py-1 text-[12px] font-medium text-[#0866FF] hover:bg-[#F5F8FF]">
            {reply.title}
          </button>
        ) : (
          <span key={index} className="rounded-full border border-[#0866FF] px-3 py-1 text-[12px] font-medium text-[#0866FF]">{reply.title}</span>
        ))}
    </div>
  )
}

interface ChatThreadProps extends TapProps {
  turns: readonly Turn[]
  /** Quick replies only show under the newest bot turn, as in Messenger. */
  lastOnlyQuickReplies?: boolean
}

export function ChatThread({ turns, onTap, lastOnlyQuickReplies = true }: ChatThreadProps) {
  const lastBot = turns.reduce((found, turn, index) => (turn.from === 'bot' ? index : found), -1)
  return (
    <div className="flex flex-col gap-2">
      {turns.map((turn, index) => {
        if (turn.from === 'customer') {
          return <p key={index} className="max-w-[78%] self-end rounded-[18px] rounded-br-[6px] bg-[#0866FF] px-3 py-2 text-[13px] text-white">{turn.text}</p>
        }
        if (turn.from === 'note') {
          return <p key={index} className="self-center py-0.5 text-center text-[11px] font-medium text-[#65676B]">{turn.text}</p>
        }
        const last = turn.messages[turn.messages.length - 1]
        const replies = last?.quickReplies ?? []
        const showReplies = replies.length > 0 && (!lastOnlyQuickReplies || index === lastBot)
        return (
          <div key={index} className="flex flex-col gap-2">
            {turn.messages.length === 0 ? <p className="self-center text-[11px] text-[#65676B]">No reply</p> : null}
            {turn.messages.map((message, messageIndex) => <BotMessage key={messageIndex} message={message} onTap={index === lastBot ? onTap : undefined} />)}
            {showReplies ? <QuickReplies replies={replies} onTap={index === lastBot ? onTap : undefined} /> : null}
          </div>
        )
      })}
    </div>
  )
}

/** A phone-sized Messenger frame with the store's name on top. */
export function PhoneFrame({ storeName, logoUrl, children, footer }: { storeName: string; logoUrl: string | null; children: ReactNode; footer?: ReactNode }) {
  const initials = storeName.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => Array.from(word)[0]?.toUpperCase() ?? '').join('')
  return (
    <div className="flex h-[640px] max-h-full w-[360px] max-w-full flex-col overflow-hidden rounded-[32px] border border-[#E5E0D6] bg-white shadow-[0_18px_50px_rgba(30,22,12,0.16)] max-md:h-full max-md:w-full max-md:rounded-none max-md:border-0 max-md:shadow-none">
      <div className="flex flex-shrink-0 items-center gap-2.5 border-b border-[#E5E5E5] px-4 py-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- the store's own logo
          <img src={logoUrl} alt="" className="h-8 w-8 rounded-full bg-neutral-100 object-cover" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1D1815] text-[11px] font-black text-white" aria-hidden>{initials}</span>
        )}
        <p className="truncate text-[14px] font-bold text-[#111]">{storeName}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">{children}</div>
      {footer ? <div className="flex-shrink-0 border-t border-[#E5E5E5]">{footer}</div> : null}
    </div>
  )
}
