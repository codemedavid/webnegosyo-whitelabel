/**
 * get_payment_methods — how customers can pay: each method, on/off, which
 * order types show it, whether proof is required, whether it has a QR.
 * Hands out `y` refs for propose_payment_method_change.
 */

import { z } from 'zod'
import { readPaymentSetup, type StorePaymentSetup } from '@/lib/assistant/data/payment-methods'
import { orderTypeLabels } from '@/lib/assistant/insights/payment-methods'
import type { AssistantToolContext, AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { RefBook } from '@/lib/assistant/refs'
import type { ToolResult } from '@/lib/assistant/types'

const input = z.object({})
type Input = z.infer<typeof input>

export function loadPaymentSetup(ctx: AssistantToolContext): Promise<StorePaymentSetup> {
  return ctx.memo('payment-setup', () => readPaymentSetup(ctx.tenantId))
}

export function buildPaymentMethodsResult(setup: StorePaymentSetup, refs: RefBook): ToolResult {
  const { methods, orderTypes } = setup
  return {
    facts: {
      methods: methods.map((method) => ({
        ref: refs.refFor('payment', method.id),
        name: method.name,
        on: method.isActive,
        orderTypes: orderTypeLabels(method.orderTypeIds, orderTypes),
        proofRequired: method.requireProof,
        hasQr: Boolean(method.qrCodeUrl),
        hasDetails: Boolean(method.details),
      })),
      orderTypesOnOffer: orderTypes.filter((type) => type.isEnabled).map((type) => type.name),
    },
    card: {
      type: 'ranked',
      title: 'How customers can pay',
      subtitle: `${methods.filter((method) => method.isActive).length} on · ${methods.length} in all`,
      rows: methods.map((method) => ({
        label: method.name,
        value: method.isActive ? 'On' : 'Off',
        detail: [orderTypeLabels(method.orderTypeIds, orderTypes), method.qrCodeUrl ? 'QR' : null, method.requireProof ? 'proof required' : null].filter(Boolean).join(' · '),
        badge: method.isActive ? undefined : 'Off',
      })),
      emptyText: 'No payment methods yet. Tell me one (e.g. “GCash 0917… J. Dela Cruz”) and I’ll set it up.',
    },
    links: [{ label: 'Open Payment methods', path: '/payment-methods' }],
  }
}

export const getPaymentMethodsTool: AssistantToolDef<Input> = {
  name: 'get_payment_methods',
  description: 'How customers can pay: each payment method, on/off, order types, proof required, QR. Gives refs for changes.',
  access: { permission: 'store_setup' },
  input,
  async run(ctx) {
    try {
      return buildPaymentMethodsResult(await loadPaymentSetup(ctx), ctx.refs)
    } catch (error) {
      return { facts: { available: false, reason: error instanceof Error ? error.message : 'Payment methods could not be read.' } }
    }
  },
}
