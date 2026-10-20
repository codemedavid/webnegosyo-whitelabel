/**
 * Every label the Branding Studio offers must change words a customer sees,
 * on every template of its screen. A key no component reads is a dead Studio
 * field; a template that hard-codes its own heading ignores the owner's edit.
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { STOREFRONT_LABEL_KEYS, type StorefrontLabelKey } from '@/lib/storefront-labels'

const SRC = join(__dirname, '../../src')
const CUSTOMER = join(SRC, 'components/customer')

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) return sourceFiles(path)
        return /\.(ts|tsx)$/.test(name) ? [path] : []
    })
}

function readsLabel(source: string, key: StorefrontLabelKey): boolean {
    // `titleLabel: 'tracking.ready'` — a step table whose rows the component renders through StoreLabel.
    return source.includes(`name="${key}"`) || source.includes(`useStorefrontLabel('${key}'`) || source.includes(`Label: '${key}'`)
}

const ALL_SOURCES = sourceFiles(SRC)
    .filter((path) => !path.endsWith('storefront-labels.ts'))
    .map((path) => readFileSync(path, 'utf8'))

describe('storefront label consumers', () => {
    it.each(STOREFRONT_LABEL_KEYS)('%s is read by a storefront component', (key) => {
        expect(ALL_SOURCES.some((source) => readsLabel(source, key))).toBe(true)
    })

    const TEMPLATE_LABELS: Record<string, readonly StorefrontLabelKey[]> = {
        'cart-drawer.tsx': ['cart.title', 'cart.empty', 'cart.total', 'cart.checkout'],
        'cart-templates/cart-primitives.tsx': ['cart.empty', 'cart.total', 'cart.checkout'],
        'cart-templates/classic-cart.tsx': ['cart.title', 'cart.empty', 'cart.total', 'cart.checkout'],
        'cart-templates/modern-cart.tsx': ['cart.title'],
        'cart-templates/minimal-cart.tsx': ['cart.title'],
        'cart-templates/wizard-cart.tsx': ['cart.title'],
        'cart-templates/express-cart.tsx': ['cart.title', 'cart.total'],
        'checkout-templates/checkout-shared.tsx': ['checkout.customer', 'checkout.summary', 'checkout.payment', 'confirmation.title'],
        'checkout-templates/classic-checkout.tsx': ['checkout.title', 'checkout.order_type', 'checkout.customer', 'checkout.summary', 'checkout.payment'],
        'checkout-templates/modern-checkout.tsx': ['checkout.title', 'checkout.order_type', 'checkout.customer', 'checkout.summary', 'checkout.payment'],
        'checkout-templates/minimal-checkout.tsx': ['checkout.title', 'checkout.order_type', 'checkout.customer', 'checkout.summary', 'checkout.payment'],
        'checkout-templates/express-checkout.tsx': ['checkout.title', 'checkout.order_type', 'checkout.customer', 'checkout.summary', 'checkout.payment', 'checkout.total'],
        'checkout-templates/wizard-checkout.tsx': ['checkout.title', 'checkout.order_type', 'checkout.customer', 'checkout.summary', 'checkout.payment'],
        'checkout-templates/bitespeed-checkout.tsx': ['checkout.order_type', 'checkout.customer', 'checkout.summary', 'checkout.payment'],
        'checkout-templates/order-summary-lines.tsx': ['checkout.total'],
        'order-tracking/tracking-dashboard.tsx': ['tracking.ring_me', 'tracking.ring_armed', 'tracking.back'],
        'order-tracking/status-hero.tsx': ['tracking.cancelled_headline', 'tracking.cancelled_detail'],
        'loyalty-stamp-card.tsx': ['loyalty.claim_title', 'loyalty.claim_button', 'loyalty.number_label', 'loyalty.privacy', 'loyalty.view_rewards'],
    }

    it('renders every status step through the store\'s wording', () => {
        const hero = readFileSync(join(CUSTOMER, 'order-tracking/status-hero.tsx'), 'utf8')
        const timeline = readFileSync(join(CUSTOMER, 'order-tracking/status-timeline.tsx'), 'utf8')

        expect(hero).toContain('name={step.headlineLabel}')
        expect(hero).toContain('name={step.descriptionLabel}')
        expect(timeline).toContain('name={step.titleLabel}')
        expect(timeline).toContain('name={step.descriptionLabel}')
    })

    it.each(Object.entries(TEMPLATE_LABELS))('%s shows the owner\'s wording', (file, keys) => {
        const source = readFileSync(join(CUSTOMER, file), 'utf8')

        expect(keys.filter((key) => !readsLabel(source, key))).toEqual([])
    })
})
