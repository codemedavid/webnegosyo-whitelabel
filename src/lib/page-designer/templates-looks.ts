// ---------------------------------------------------------------------------
// The looks that come in a matching set for checkout, thank-you and order
// tracking ("families"). A family id is shared by one template on each page,
// so an owner who picks the Delivery app checkout can be offered the Delivery
// app thank-you and tracking pages too (templates-families.ts).
//
// Each look is page-wide part styles: shape and type only, so it wears the
// store's own colours. The few fixed colours are neutral ink (Bold blocks).
// ---------------------------------------------------------------------------

import type { PartStyles } from './template-kit'

export const TEMPLATE_FAMILIES = ['delivery-app', 'receipt-roll', 'bold-blocks', 'ticket-stub', 'editorial', 'chat'] as const
export type TemplateFamily = (typeof TEMPLATE_FAMILIES)[number]

/** The family's name in the owner's words ("the Delivery app look"). */
export const FAMILY_NAMES: Readonly<Record<TemplateFamily, string>> = {
  'delivery-app': 'Delivery app',
  'receipt-roll': 'Receipt roll',
  'bold-blocks': 'Bold blocks',
  'ticket-stub': 'Ticket stub',
  editorial: 'Editorial',
  chat: 'Chat',
}

/** Neutral ink for the Bold blocks borders (reads on light and dark stores alike as a frame). */
export const INK = '#111111'

/** Receipt paper and its ink, for the receipt itself only (the rest follows the store). */
export const PAPER = '#fffdf7'
export const PAPER_INK = '#1c1917'
export const PAPER_MUTED = '#57534e'
export const PAPER_RULE = '#a8a29e'

/** Rounded cards with no shadow on soft bands, pill buttons. */
export const DELIVERY_LOOK: PartStyles = {
  p_card_radius: 'xl',
  p_card_bw: '0',
  p_card_shadow: 'none',
  p_title_size: 'lg',
  p_title_weight: '800',
  p_option_radius: 'lg',
  p_option_shadow: 'none',
  p_field_radius: 'lg',
  p_button_radius: 'pill',
  p_button_height: 'lg',
  p_button_weight: '800',
  p_button_alt_radius: 'pill',
  p_badge_radius: 'pill',
}

/** Typewriter letters, square dashed edges, a heavy total. */
export const RECEIPT_LOOK: PartStyles = {
  p_card_radius: 'none',
  p_card_shadow: 'none',
  p_card_bw: '1',
  p_card_bs: 'dashed',
  p_title_font: 'mono',
  p_title_case: 'upper',
  p_title_letter: 'wide',
  p_title_size: 'md',
  p_title_weight: '700',
  p_subtitle_font: 'mono',
  p_text_font: 'mono',
  p_label_case: 'upper',
  p_label_size: 'xs',
  p_option_radius: 'none',
  p_option_shadow: 'none',
  p_option_bs: 'dashed',
  p_field_radius: 'none',
  p_button_radius: 'none',
  p_button_case: 'upper',
  p_button_weight: '800',
  p_button_alt_radius: 'none',
  p_divider_bs: 'dashed',
  p_divider_bw: '1',
  p_total_weight: '800',
  p_total_size: 'xl',
  p_badge_radius: 'none',
}

/** The receipt slip itself on paper (one block). */
export const RECEIPT_PAPER: PartStyles = {
  p_card_bg: PAPER,
  p_card_border: PAPER_RULE,
  p_title_color: PAPER_INK,
  p_subtitle_color: PAPER_MUTED,
  p_text_color: PAPER_INK,
  p_muted_color: PAPER_MUTED,
  p_price_color: PAPER_INK,
  p_total_color: PAPER_INK,
  p_divider_border: PAPER_RULE,
}

/** Thick ink frames, hard shadows, black-weight capitals. */
export const BOLD_LOOK: PartStyles = {
  p_card_bw: '3',
  p_card_border: INK,
  p_card_shadow: 'hard',
  p_card_radius: 'md',
  p_title_weight: '900',
  p_title_case: 'upper',
  p_title_letter: 'tight',
  p_title_size: 'xl',
  p_option_bw: '2',
  p_option_border: INK,
  p_option_radius: 'md',
  p_option_shadow: 'none',
  p_option_on_bw: '3',
  p_option_on_shadow: 'hard',
  p_option_label_weight: '800',
  p_option_label_case: 'upper',
  p_field_bw: '2',
  p_field_border: INK,
  p_field_radius: 'md',
  p_label_weight: '800',
  p_label_case: 'upper',
  p_label_size: 'xs',
  p_button_bw: '3',
  p_button_border: INK,
  p_button_shadow: 'hard',
  p_button_radius: 'md',
  p_button_case: 'upper',
  p_button_weight: '900',
  p_button_height: 'lg',
  p_button_alt_bw: '2',
  p_button_alt_border: INK,
  p_button_alt_radius: 'md',
  p_divider_bw: '2',
  p_badge_radius: 'none',
  p_total_weight: '900',
}

/** Rounded tickets with perforated (dashed) tear lines and a big total. */
export const TICKET_LOOK: PartStyles = {
  p_card_radius: 'lg',
  p_card_shadow: 'md',
  p_card_bw: '0',
  p_title_case: 'upper',
  p_title_letter: 'wide',
  p_title_size: 'md',
  p_title_weight: '800',
  p_option_radius: 'lg',
  p_option_bs: 'dashed',
  p_option_bw: '2',
  p_option_shadow: 'none',
  p_divider_bs: 'dashed',
  p_divider_bw: '2',
  p_button_radius: 'lg',
  p_button_case: 'upper',
  p_button_weight: '800',
  p_badge_radius: 'pill',
  p_total_size: '2xl',
  p_total_weight: '900',
}

/** Serif titles, hairlines, square edges, small-caps labels. */
export const EDITORIAL_LOOK: PartStyles = {
  p_card_radius: 'none',
  p_card_shadow: 'none',
  p_card_bw: '0',
  p_title_font: 'playfair-display',
  p_title_weight: '600',
  p_title_size: '2xl',
  p_title_letter: 'tight',
  p_subtitle_font: 'lora',
  p_option_radius: 'none',
  p_option_shadow: 'none',
  p_option_bw: '1',
  p_field_radius: 'none',
  p_label_case: 'upper',
  p_label_size: 'xs',
  p_label_weight: '600',
  p_button_radius: 'none',
  p_button_case: 'upper',
  p_button_weight: '600',
  p_button_alt_radius: 'none',
  p_link_underline: 'yes',
  p_link_weight: '600',
  p_divider_bw: '1',
  p_price_weight: '500',
  p_badge_radius: 'none',
}

/** Bubbles: very round cards, pill choices and buttons. */
export const CHAT_LOOK: PartStyles = {
  p_card_radius: 'xl',
  p_card_shadow: 'sm',
  p_card_bw: '0',
  p_title_size: 'lg',
  p_title_weight: '700',
  p_option_radius: 'pill',
  p_option_on_shadow: 'md',
  p_field_radius: 'xl',
  p_label_weight: '600',
  p_button_radius: 'pill',
  p_button_height: 'lg',
  p_button_weight: '700',
  p_button_alt_radius: 'pill',
  p_badge_radius: 'pill',
}

/** Editorial pages set serif headings for the words the owner adds. */
export const EDITORIAL_THEME = { headingFont: 'playfair-display', bodyFont: '' } as const
