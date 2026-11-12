/**
 * The Branding Studio's "Payment step" screen: one field per
 * `payment_step_style` key (virtual fields `payment_step_style.<key>`, one look
 * on every device). The wording section is added by the registry (it lives in
 * `storefront_labels`, screen `payment`). The Page Designer's checkout Look tab
 * shows these same sections.
 */

import type { BrandingField, BrandingSection } from '@/lib/branding-registry'
import {
    PAYMENT_STEP_CHOICES,
    PAYMENT_STEP_TOGGLES,
    type PaymentStepChoiceKey,
    type PaymentStepColorKey,
    type PaymentStepToggleKey,
} from '@/lib/payment-step/style'

const id = (key: string) => `payment_step_style.${key}`

function color(key: PaymentStepColorKey, label: string, inheritsFrom?: string): BrandingField {
    return { id: id(key), label, type: 'color', default: null, columnBacked: true, ...(inheritsFrom ? { inheritsFrom } : {}) }
}

function choice(key: PaymentStepChoiceKey, label: string, optionLabels: Readonly<Record<string, string>>): BrandingField {
    const { options, default: fallback } = PAYMENT_STEP_CHOICES[key]
    return { id: id(key), label, type: 'select', options, default: fallback, columnBacked: true, optionLabels }
}

function toggle(key: PaymentStepToggleKey, label: string): BrandingField {
    return { id: id(key), label, type: 'toggle', default: PAYMENT_STEP_TOGGLES[key], columnBacked: true }
}

export const PAYMENT_STEP_LAYOUT_LABELS: Readonly<Record<string, string>> = {
    sheet: 'Bottom sheet',
    popup: 'Pop-up card',
    fullscreen: 'Full screen',
    screen: 'Its own screen',
}

export const PAYMENT_UPLOAD_DESIGN_LABELS: Readonly<Record<string, string>> = {
    classic: 'Upload box',
    button: 'Big button',
    steps: 'Steps',
    compact: 'Compact',
    reference: 'Reference first',
}

export const PAYMENT_STEP_STYLE_SECTIONS: readonly BrandingSection[] = [
    {
        title: 'How it opens',
        fields: [choice('layout', 'Layout', PAYMENT_STEP_LAYOUT_LABELS)],
    },
    {
        title: 'Receipt upload',
        fields: [
            choice('upload_design', 'Design', PAYMENT_UPLOAD_DESIGN_LABELS),
            {
                id: id('sample_image'),
                label: 'Example receipt (optional)',
                type: 'image',
                default: '',
                placeholder: 'https://…/receipt.jpg',
                columnBacked: true,
            },
        ],
    },
    {
        title: 'Top of the step',
        fields: [
            choice('header_style', 'Style', { band: 'Colour band', plain: 'Plain' }),
            toggle('show_breakdown', 'Show the order breakdown'),
            { ...color('band_color', 'Band colour', 'checkout_button_color'), showWhen: { fieldId: id('header_style'), values: ['band'] } },
            { ...color('band_text', 'Band text'), showWhen: { fieldId: id('header_style'), values: ['band'] } },
        ],
    },
    {
        title: 'Colours',
        fields: [
            color('accent', 'Accent (links, attached chip)', 'checkout_accent_color'),
            color('button_color', 'Send order button', 'checkout_button_color'),
            color('button_text', 'Button text'),
        ],
    },
]
