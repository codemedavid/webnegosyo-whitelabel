/**
 * The sentence that will land on a guest's handset.
 *
 * The editor asked a merchant to write `Hi {{firstName}}, we miss you at
 * {{storeName}}!` into a plain textarea and then send it to several hundred
 * people, and at no point showed them the message. Placeholders are the one
 * part of this feature a merchant has no way to check by reading.
 *
 * Everything here is total. `renderMessage` throws on an unknown placeholder —
 * exactly right on the send path, where a typo must stop a blast — but a
 * preview that throws takes the screen down while the merchant is still
 * halfway through typing the word.
 */

import { MISSING_NAME_FALLBACK, renderMessage, validateTemplate } from "./message-template";
import type { SmsCustomer } from "./types";

/**
 * Who the preview speaks to when the campaign matches nobody.
 *
 * Every field a template can reference is filled: a sample missing
 * `last_order_at` renders `{{lastOrderDate}}` as an empty string, and the
 * merchant reads a sentence with a hole in it and starts editing around it.
 */
export const SAMPLE_GUEST: SmsCustomer = {
  id: "sample",
  name: "Maria Santos",
  phone_e164: "+639170000000",
  order_count: 3,
  total_spent: 780,
  last_order_at: "2026-07-02T04:00:00.000Z",
  channels_used: [],
  sms_consent: true,
  sms_opt_out: false,
};

export interface MessagePreview {
  /** The rendered message, or the raw template when it cannot be rendered. */
  body: string;
  /** True when the template is blank — draw the empty state, not a bubble. */
  isEmpty: boolean;
  /** True when this is the sample guest rather than a real recipient. */
  isSample: boolean;
  /** A placeholder the merchant mistyped, said in their words. */
  problem: string | null;
}

export function buildMessagePreview(
  template: string,
  recipient: SmsCustomer | null,
  storeName: string
): MessagePreview {
  if (template.trim() === "") {
    return { body: "", isEmpty: true, isSample: recipient === null, problem: null };
  }

  const isSample = recipient === null;
  const guest = recipient ?? SAMPLE_GUEST;

  // Asked before rendering, because `renderMessage` reports the same fact by
  // throwing and a preview must not.
  const validation = validateTemplate(template);
  if (!validation.isValid) {
    const names = validation.unknownVariables.map((name) => `{{${name}}}`).join(", ");
    return {
      body: template,
      isEmpty: false,
      isSample,
      problem: `${names} is not a real placeholder, so it would be sent as-is.`,
    };
  }

  return {
    body: renderMessage(template, guest, { storeName }),
    isEmpty: false,
    isSample,
    problem: null,
  };
}

/** Re-exported so the editor can explain what an unnamed guest will be called. */
export { MISSING_NAME_FALLBACK };
