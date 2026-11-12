/**
 * propose_payment_method / propose_payment_method_change — add a way to pay
 * (GCash, Maya, bank transfer, cash…) or change one, for the owner to
 * confirm. A QR photo attached to the message is hosted when proposed so the
 * card shows exactly what customers will scan; the chat model never sees it.
 * Nothing is ever deleted: a method is switched off instead.
 */

import { z } from 'zod'
import { hostPaymentQr } from '@/lib/assistant/data/payment-methods'
import { loadPaymentSetup } from '@/lib/assistant/tools/reads/payment-methods'
import {
  cleanPaymentDetails,
  findMethodByName,
  matchOrderTypes,
  orderTypeLabels,
  type StoreOrderType,
} from '@/lib/assistant/insights/payment-methods'
import { fileProposal, refused } from '@/lib/assistant/tools/propose/shared'
import type { PaymentMethodChangePayload, PaymentMethodPayload } from '@/lib/assistant/actions/kinds'
import type { AssistantToolContext, AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { ConfirmCard, ToolResult } from '@/lib/assistant/types'

const qrPhotoField = z
  .number()
  .int()
  .min(1)
  .max(3)
  .nullable()
  .describe('Which attached photo is the payment QR (1 = first); null = none')

const orderTypesField = z
  .array(z.string().trim().min(1).max(40))
  .max(10)
  .nullable()
  .describe('Order types that offer it, by name (Dine in, Pickup, Delivery); null = all')

type QrResult = { ok: true; url: string | null } | { ok: false; reason: string }

async function hostQr(ctx: AssistantToolContext, index: number | null): Promise<QrResult> {
  if (index === null) return { ok: true, url: null }
  const photo = ctx.photos[index - 1]
  if (!photo) return { ok: false, reason: 'No photo is attached to this message. Ask the user to attach the QR again.' }
  try {
    return { ok: true, url: await hostPaymentQr(ctx.tenantId, photo) }
  } catch (error) {
    console.error('[assistant] payment QR upload failed', { tenantId: ctx.tenantId, message: error instanceof Error ? error.message : String(error) })
    return { ok: false, reason: 'The QR photo could not be uploaded. Try again, or add it on the Payment methods page.' }
  }
}

function unknownTypes(unknown: readonly string[], orderTypes: readonly StoreOrderType[]): ToolResult {
  const offered = orderTypes.filter((type) => type.isEnabled).map((type) => type.name)
  return refused(`Unknown order type: ${unknown.join(', ')}. This store offers: ${offered.join(', ') || 'none'}.`)
}

const createInput = z.object({
  name: z.string().trim().min(2).max(60).describe('e.g. GCash, Maya, BPI transfer, Cash'),
  details: z.string().trim().max(500).nullable().describe('What customers read at checkout: account name and number'),
  orderTypes: orderTypesField,
  requireProof: z.boolean().nullable().describe('Customer must upload a screenshot or reference number; null = no'),
  qrPhoto: qrPhotoField,
})
type CreateInput = z.infer<typeof createInput>

export const proposePaymentMethodTool: AssistantToolDef<CreateInput> = {
  name: 'propose_payment_method',
  description: 'Propose adding a payment method customers see at checkout (name, account details, optional QR photo). The user must confirm.',
  access: { permission: 'store_setup' },
  input: createInput,
  async run(ctx, request) {
    let setup
    try {
      setup = await loadPaymentSetup(ctx)
    } catch (error) {
      return refused(error instanceof Error ? error.message : 'Payment methods could not be read.')
    }
    const existing = findMethodByName(setup.methods, request.name)
    if (existing) return refused(`The store already has "${existing.name}". Use get_payment_methods and propose_payment_method_change instead.`)

    const types = matchOrderTypes(request.orderTypes, setup.orderTypes)
    if (!types.ok) return unknownTypes(types.unknown, setup.orderTypes)
    if (types.ids.length === 0) return refused('The store has no order types switched on, so customers could not see this method. Turn one on in Order types first.')

    const qr = await hostQr(ctx, request.qrPhoto)
    if (!qr.ok) return refused(qr.reason)

    const details = cleanPaymentDetails(request.details)
    const payload: PaymentMethodPayload = {
      name: request.name,
      details,
      qrCodeUrl: qr.url,
      orderTypeIds: types.ids,
      requireProof: request.requireProof === true,
    }
    const lines: ConfirmCard['lines'] = [
      { label: 'Shows for', value: orderTypeLabels(types.ids, setup.orderTypes) },
      { label: 'Details', value: details ?? '—' },
      { label: 'QR code', value: qr.url ? 'Yes (below)' : 'No' },
      { label: 'Proof of payment', value: payload.requireProof ? 'Required' : 'Not required' },
    ]
    return fileProposal(ctx, {
      kind: 'payment_method',
      payload,
      summary: `Add payment method ${request.name}`,
      title: `Add ${request.name} as a way to pay`,
      lines,
      imageUrl: qr.url ?? undefined,
      warning: 'Customers see it at checkout as soon as you confirm. Check the number and name carefully.',
    })
  },
}

const changeInput = z.object({
  method: z.string().describe('Payment method ref from get_payment_methods'),
  name: z.string().trim().min(2).max(60).nullable(),
  details: z.string().trim().max(500).nullable().describe('New account details; null = keep'),
  active: z.boolean().nullable().describe('false = switch off (hidden at checkout); null = keep'),
  requireProof: z.boolean().nullable(),
  orderTypes: orderTypesField.describe('New order types by name; null = keep'),
  qrPhoto: qrPhotoField.describe('Attached photo that replaces the QR; null = keep'),
  removeQr: z.boolean().nullable().describe('true = take the QR off'),
})
type ChangeInput = z.infer<typeof changeInput>

export const proposePaymentMethodChangeTool: AssistantToolDef<ChangeInput> = {
  name: 'propose_payment_method_change',
  description: 'Propose changing a payment method: switch on/off, details, QR, order types, proof. Never deletes. The user must confirm.',
  access: { permission: 'store_setup' },
  input: changeInput,
  async run(ctx, request) {
    const methodId = ctx.refs.resolve(request.method, 'payment')
    if (!methodId) return refused('Unknown payment method ref. Call get_payment_methods first.')
    let setup
    try {
      setup = await loadPaymentSetup(ctx)
    } catch (error) {
      return refused(error instanceof Error ? error.message : 'Payment methods could not be read.')
    }
    const method = setup.methods.find((row) => row.id === methodId)
    if (!method) return refused('That payment method no longer exists.')
    if (request.qrPhoto !== null && request.removeQr === true) return refused('Either replace the QR or remove it, not both.')

    let orderTypeIds: string[] | null = null
    if (request.orderTypes !== null) {
      const types = matchOrderTypes(request.orderTypes, setup.orderTypes)
      if (!types.ok) return unknownTypes(types.unknown, setup.orderTypes)
      if (types.ids.length === 0) return refused('A payment method needs at least one order type, or customers cannot see it. Switch it off instead.')
      orderTypeIds = types.ids
    }
    if (request.name !== null) {
      const clash = findMethodByName(setup.methods, request.name)
      if (clash && clash.id !== method.id) return refused(`Another payment method is already called "${clash.name}".`)
    }

    const qr = await hostQr(ctx, request.qrPhoto)
    if (!qr.ok) return refused(qr.reason)

    const changes: PaymentMethodChangePayload['changes'] = {
      name: request.name !== null && request.name !== method.name ? request.name : null,
      details: request.details !== null ? (cleanPaymentDetails(request.details) ?? '') : null,
      qrCodeUrl: request.removeQr === true ? '' : qr.url,
      isActive: request.active !== null && request.active !== method.isActive ? request.active : null,
      requireProof: request.requireProof !== null && request.requireProof !== method.requireProof ? request.requireProof : null,
      orderTypeIds,
    }
    const lines: ConfirmCard['lines'] = []
    if (changes.name !== null) lines.push({ label: 'Name', value: `${method.name} → ${changes.name}` })
    if (changes.isActive !== null) lines.push({ label: 'Status', value: changes.isActive ? 'On — shown at checkout' : 'Off — hidden at checkout (kept for past orders)' })
    if (changes.details !== null) lines.push({ label: 'Details', value: changes.details || 'Removed' })
    if (changes.qrCodeUrl !== null) lines.push({ label: 'QR code', value: changes.qrCodeUrl ? 'New QR (below)' : 'Removed' })
    if (changes.requireProof !== null) lines.push({ label: 'Proof of payment', value: changes.requireProof ? 'Required' : 'Not required' })
    if (changes.orderTypeIds !== null) lines.push({ label: 'Shows for', value: orderTypeLabels(changes.orderTypeIds, setup.orderTypes) })
    if (lines.length === 0) return refused(`Nothing would change: ${method.name} already looks like that.`)

    const payload: PaymentMethodChangePayload = { paymentMethodId: method.id, name: method.name, changes, expectedUpdatedAt: method.updatedAt }
    return fileProposal(ctx, {
      kind: 'payment_method_change',
      payload,
      summary: `Change payment method ${method.name}`,
      title: `Change ${method.name}`,
      lines,
      imageUrl: changes.qrCodeUrl || undefined,
      warning: 'Checkout changes as soon as you confirm.',
    })
  },
}
