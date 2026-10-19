/**
 * The Branding Studio's "Order status" and "Loyalty card" screens: one field
 * per `tracking_style` key (virtual fields `tracking_style.<key>`, one look on
 * every device), grouped by the part of the page they change. The wording
 * sections are added by the registry (they live in `storefront_labels`).
 */

import type { BrandingField, BrandingSection } from '@/lib/branding-registry'
import { TRACKING_CHOICES, TRACKING_TOGGLES, type TrackingChoiceKey, type TrackingColorKey, type TrackingToggleKey } from '@/lib/tracking-style/keys'

const id = (key: string) => `tracking_style.${key}`

function color(key: TrackingColorKey, label: string, inheritsFrom?: string): BrandingField {
    return { id: id(key), label, type: 'color', default: null, columnBacked: true, ...(inheritsFrom ? { inheritsFrom } : {}) }
}

function choice(key: TrackingChoiceKey, label: string, optionLabels?: Readonly<Record<string, string>>): BrandingField {
    const { options, default: fallback } = TRACKING_CHOICES[key]
    return { id: id(key), label, type: 'select', options, default: fallback, columnBacked: true, ...(optionLabels ? { optionLabels } : {}) }
}

function toggle(key: TrackingToggleKey, label: string): BrandingField {
    return { id: id(key), label, type: 'toggle', default: TRACKING_TOGGLES[key], columnBacked: true }
}

function when(field: BrandingField, key: TrackingChoiceKey | TrackingToggleKey, values: readonly string[]): BrandingField {
    return { ...field, showWhen: { fieldId: id(key), values } }
}

export const TRACKING_STYLE_SECTIONS: readonly BrandingSection[] = [
    {
        title: 'Page',
        fields: [
            color('accent', 'Accent', 'primary_color'),
            color('page_background', 'Background', 'background_color'),
            color('card_background', 'Cards', 'cards_color'),
            color('card_border', 'Card borders', 'cards_border_color'),
            color('text', 'Text', 'text_primary_color'),
            color('muted_text', 'Soft text', 'text_secondary_color'),
            choice('corners', 'Corners'),
            toggle('show_glow', 'Colour glow at the top'),
            color('page_glow_color', 'Glow colour', id('accent')),
        ],
    },
    {
        title: 'Header',
        fields: [
            color('header_background', 'Background', id('card_background')),
            color('header_text', 'Store name', id('text')),
            toggle('show_live_badge', 'Show "Live" badge'),
            color('live_badge', '"Live" badge', id('accent')),
        ],
    },
    {
        title: 'Status banner',
        fields: [
            choice('hero_style', 'Style'),
            color('hero_color', 'Colour', id('accent')),
            when(color('hero_color_end', 'Second colour', id('hero_color')), 'hero_style', ['gradient']),
            color('hero_text', 'Text'),
            color('hero_bar', 'Progress bar'),
            color('cancelled_color', 'Cancelled colour', 'error_color'),
        ],
    },
    {
        title: 'Ring-me button',
        fields: [
            color('ring_background', 'Background', id('card_background')),
            color('ring_text', 'Text', id('accent')),
            color('ring_border', 'Border', id('accent')),
            color('ring_armed', 'After tapping', 'success_color'),
        ],
    },
    {
        title: 'Progress timeline',
        fields: [
            toggle('show_timeline', 'Show the timeline'),
            color('timeline_done', 'Done steps', 'success_color'),
            color('timeline_current', 'Current step', id('accent')),
            color('timeline_upcoming', 'Next steps', id('card_border')),
        ],
    },
    {
        title: 'Order summary',
        fields: [
            color('summary_total', 'Total', id('accent')),
            color('summary_badge', 'Quantity badge', id('accent')),
        ],
    },
    {
        title: 'Pickup code',
        fields: [
            color('pickup_background', 'Background', id('card_background')),
            color('pickup_border', 'Border', id('card_border')),
            color('pickup_text', 'Text', id('text')),
            color('pickup_ready', 'Ready colour', 'success_color'),
        ],
    },
    {
        title: 'Ready alert',
        fields: [
            color('alert_background', 'Background', id('hero_color')),
            color('alert_text', 'Text'),
            color('alert_button', 'Button', id('alert_text')),
            color('alert_button_text', 'Button text'),
        ],
    },
    {
        title: 'Layout',
        fields: [choice('loyalty_position', 'Loyalty card', { top: 'Under the status', bottom: 'After the receipt' })],
    },
]

export const LOYALTY_STYLE_SECTIONS: readonly BrandingSection[] = [
    {
        title: 'Card',
        fields: [
            color('loyalty_background', 'Background', id('card_background')),
            color('loyalty_border', 'Border', id('card_border')),
            color('loyalty_text', 'Text', id('text')),
            color('loyalty_muted_text', 'Soft text', id('muted_text')),
            color('input_background', 'Number box'),
        ],
    },
    {
        title: 'Top band',
        fields: [
            choice('band_style', 'Style'),
            color('band_color', 'Colour', id('accent')),
            when(color('band_color_end', 'Second colour', id('band_color')), 'band_style', ['gradient']),
            color('band_text', 'Text'),
        ],
    },
    {
        title: 'Stamps',
        fields: [
            choice('stamp_shape', 'Shape'),
            choice('stamp_fill', 'Earned stamp shows', { logo: 'Your logo', check: 'A tick' }),
            color('stamp_color', 'Stamp colour', id('accent')),
            color('stamp_mark', 'Tick on a stamp'),
            color('stamp_empty', 'Empty slot', id('loyalty_border')),
            color('stamp_next', 'Next stamp', id('stamp_color')),
            color('stamp_badge', 'Number badge', id('stamp_color')),
            color('stamp_reached', 'Reached reward', 'success_color'),
        ],
    },
    {
        title: 'Buttons & links',
        fields: [
            color('loyalty_button', 'Claim button', 'button_primary_color'),
            color('loyalty_button_text', 'Claim button text', 'button_primary_text_color'),
            color('loyalty_link', 'Links', id('accent')),
            color('wallet_background', '"Save to phone" box', id('accent')),
        ],
    },
    {
        title: 'Celebration',
        fields: [toggle('confetti', 'Confetti when a stamp lands')],
    },
]
