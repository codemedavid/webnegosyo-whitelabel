/**
 * The ONE rule for a registry message's words: the store's own text, filled,
 * unless it fills to nothing; then the built-in text in the store's language
 * (by order kind where the registry has a pickup / delivery variant). Every
 * message — bot replies, chat-order texts, the website's cart and order
 * texts — goes through here, so "blank = default" means the same everywhere.
 * Pure and browser-safe.
 */

import { fillTemplate, type FillValues } from './fill'
import { defaultText, type MessageSettings, type OrderKindForMessages, type TextMessageId } from './registry'

export function storeWords(
  messages: MessageSettings | undefined,
  id: TextMessageId,
  values: FillValues,
  kind: OrderKindForMessages = null,
): string {
  const custom = messages?.texts[id]
  return (custom ? fillTemplate(custom, values) : '') || fillTemplate(defaultText(id, messages?.lang, kind), values)
}
