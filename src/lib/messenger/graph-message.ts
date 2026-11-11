/**
 * What a reply is, independent of how it is shown.
 *
 * Reply builders return `OutgoingMessage[]`. The webhook turns each into the
 * Graph `message` object (`toGraphMessage`), and the merchant editor's preview
 * renders the very same objects, so the preview cannot drift from what the
 * customer receives.
 */

export interface UrlButton {
  type: 'web_url'
  title: string
  url: string
}

export interface PostbackButton {
  type: 'postback'
  title: string
  payload: string
}

export type MessengerButton = UrlButton | PostbackButton

export interface QuickReply {
  title: string
  payload: string
}

export interface CardElement {
  title: string
  subtitle?: string
  imageUrl?: string
  /** Where a tap on the card itself goes. */
  tapUrl?: string
  buttons: MessengerButton[]
}

export type OutgoingMessage =
  | { kind: 'text'; text: string; quickReplies?: QuickReply[] }
  /** Text with up to 3 buttons under it (Meta's button template). */
  | { kind: 'buttons'; text: string; buttons: MessengerButton[]; quickReplies?: QuickReply[] }
  /** One card or a carousel (Meta's generic template). */
  | { kind: 'cards'; cards: CardElement[]; quickReplies?: QuickReply[] }

function graphButton(button: MessengerButton): Record<string, unknown> {
  return button.type === 'web_url'
    ? { type: 'web_url', url: button.url, title: button.title }
    : { type: 'postback', title: button.title, payload: button.payload }
}

function graphQuickReplies(quickReplies: QuickReply[] | undefined): Record<string, unknown> {
  if (!quickReplies || quickReplies.length === 0) return {}
  return {
    quick_replies: quickReplies.map((reply) => ({ content_type: 'text', title: reply.title, payload: reply.payload })),
  }
}

function graphCard(card: CardElement): Record<string, unknown> {
  return {
    title: card.title,
    ...(card.subtitle ? { subtitle: card.subtitle } : {}),
    ...(card.imageUrl ? { image_url: card.imageUrl } : {}),
    ...(card.tapUrl ? { default_action: { type: 'web_url', url: card.tapUrl } } : {}),
    ...(card.buttons.length > 0 ? { buttons: card.buttons.map(graphButton) } : {}),
  }
}

/** The `message` object of a Send API request. */
export function toGraphMessage(message: OutgoingMessage): Record<string, unknown> {
  switch (message.kind) {
    case 'text':
      return { text: message.text, ...graphQuickReplies(message.quickReplies) }
    case 'buttons':
      return {
        attachment: {
          type: 'template',
          payload: { template_type: 'button', text: message.text, buttons: message.buttons.map(graphButton) },
        },
        ...graphQuickReplies(message.quickReplies),
      }
    case 'cards':
      return {
        attachment: {
          type: 'template',
          payload: { template_type: 'generic', elements: message.cards.map(graphCard) },
        },
        ...graphQuickReplies(message.quickReplies),
      }
  }
}
