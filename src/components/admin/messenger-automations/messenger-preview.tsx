'use client'

import { ExternalLink } from 'lucide-react'
import type { CardElement, MessengerButton, OutgoingMessage, QuickReply } from '@/lib/messenger/graph-message'

interface MessengerPreviewProps {
  /** What the customer typed or tapped, shown as their bubble. */
  customerLine: string
  messages: readonly OutgoingMessage[]
  storeName: string
}

function PreviewButton({ button }: { button: MessengerButton }) {
  return (
    <div className="flex items-center justify-center gap-1 border-t border-neutral-200 px-3 py-2 text-center text-sm font-semibold text-[#0866ff]">
      <span className="truncate">{button.title}</span>
      {button.type === 'web_url' ? <ExternalLink className="h-3 w-3 shrink-0" aria-hidden /> : null}
    </div>
  )
}

function PreviewCard({ card }: { card: CardElement }) {
  return (
    <div className="w-56 shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      {card.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote menu photos, shown as Messenger shows them
        <img src={card.imageUrl} alt="" className="aspect-[1.91/1] w-full bg-neutral-100 object-cover" />
      ) : null}
      <div className="space-y-0.5 px-3 py-2">
        <p className="line-clamp-2 text-sm font-semibold text-neutral-900">{card.title}</p>
        {card.subtitle ? <p className="line-clamp-2 text-xs text-neutral-500">{card.subtitle}</p> : null}
      </div>
      {card.buttons.map((button, index) => <PreviewButton key={index} button={button} />)}
    </div>
  )
}

function QuickReplies({ replies }: { replies: readonly QuickReply[] }) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5 pt-1">
      {replies.map((reply, index) => (
        <span key={index} className="rounded-full border border-[#0866ff] px-3 py-1 text-xs font-medium text-[#0866ff]">
          {reply.title}
        </span>
      ))}
    </div>
  )
}

function BotMessage({ message }: { message: OutgoingMessage }) {
  switch (message.kind) {
    case 'text':
      return <p className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-bl-md bg-neutral-100 px-3 py-2 text-sm text-neutral-900">{message.text}</p>
    case 'buttons':
      return (
        <div className="w-60 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <p className="whitespace-pre-line px-3 py-2 text-sm text-neutral-900">{message.text}</p>
          {message.buttons.map((button, index) => <PreviewButton key={index} button={button} />)}
        </div>
      )
    case 'cards':
      return (
        <div className="-mx-1 flex max-w-full gap-2 overflow-x-auto px-1 pb-1">
          {message.cards.map((card, index) => <PreviewCard key={index} card={card} />)}
        </div>
      )
  }
}

/**
 * A Messenger-looking thread for the editor. It renders the very messages the
 * webhook would send (`buildReply`), so what the owner sees is what goes out.
 * Messenger's own colours on purpose: this is Meta's app, not the storefront.
 */
export function MessengerPreview({ customerLine, messages, storeName }: MessengerPreviewProps) {
  const last = messages[messages.length - 1]
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white" aria-label="Messenger preview">
      <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2">
        <div className="h-7 w-7 rounded-full bg-neutral-200" aria-hidden />
        <p className="truncate text-sm font-semibold text-neutral-900">{storeName}</p>
      </div>
      <div className="space-y-2 px-3 py-3">
        {customerLine ? (
          <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[#0866ff] px-3 py-2 text-sm text-white">{customerLine}</p>
        ) : null}
        {messages.length === 0 ? <p className="text-center text-xs text-neutral-500">No reply</p> : null}
        {messages.map((message, index) => <BotMessage key={index} message={message} />)}
        {last?.quickReplies && last.quickReplies.length > 0 ? <QuickReplies replies={last.quickReplies} /> : null}
      </div>
    </div>
  )
}
