'use client'

import { useState, type FormEvent } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Copy, Link2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createPinLinkAction, saveDeliveryDetailsAction } from '@/app/actions/delivery-details'
import { DELIVERY_ADDRESS_FIELD_NAME } from '@/lib/customer-details'
import { DELIVERY_STORE_NOTE_KEY, findDeliveryDetails } from '@/lib/delivery/delivery-details'
import { deliveryEditRefusal, DELIVERY_PIN_KM_KEY, DELIVERY_PIN_UPDATED_BY_KEY, merchantDeliveryChanges, type MerchantDeliveryDraft } from '@/lib/delivery/order-delivery-edit'
import { buildRiderMessage, buildRiderRemarks } from '@/lib/delivery/rider-remarks'
import { isPinSkipped } from '@/lib/delivery/unpinned-delivery'
import { toLatLng, type LatLng } from '@/lib/delivery-fee'

const AddressAutocomplete = dynamic(
  () => import('@/components/shared/address-autocomplete').then((mod) => ({ default: mod.AddressAutocomplete })),
  { ssr: false },
)

const INPUT_CLASS = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500'
const DETAIL_MAX_LENGTH = 200
const STORE_NOTE_MAX_LENGTH = 300

export interface OrderDeliveryCardProps {
  tenantId: string
  order: {
    id: string
    status: string
    customer_name?: string | null
    customer_contact?: string | null
    customer_data?: unknown
    lalamove_order_id?: string | null
    lalamove_status?: string | null
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

async function shareLink(url: string): Promise<'shared' | 'copied' | 'failed'> {
  const message = `Please set your exact delivery spot here: ${url}`
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ text: message })
      return 'shared'
    }
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch (error) {
    // Closing the share sheet lands here too, and that is not a failure worth a message.
    if (error instanceof DOMException && error.name === 'AbortError') return 'shared'
    console.error('[order-delivery] could not share the pin link:', error)
    return 'failed'
  }
}

/**
 * What the rider will read, and every way to fix it before a rider is booked:
 * edit the address, pin and notes, or send the customer a link to drop their
 * own pin. Works for own riders too (Copy for rider). Platform orders only; the
 * server says so on the others.
 */
export function OrderDeliveryCard({ tenantId, order }: OrderDeliveryCardProps) {
  const router = useRouter()
  const [answers, setAnswers] = useState<Record<string, unknown>>((order.customer_data as Record<string, unknown> | null) ?? {})
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLinking, setIsLinking] = useState(false)
  const [linkUrl, setLinkUrl] = useState<string | null>(null)

  const details = findDeliveryDetails(answers)
  const [address, setAddress] = useState(text(answers[DELIVERY_ADDRESS_FIELD_NAME]))
  const [pin, setPin] = useState<LatLng | null>(toLatLng(answers.delivery_lat, answers.delivery_lng))
  const [unit, setUnit] = useState(details.unit)
  const [landmark, setLandmark] = useState(details.landmark)
  const [riderNote, setRiderNote] = useState(details.riderNote)
  const [storeNote, setStoreNote] = useState(text(answers[DELIVERY_STORE_NOTE_KEY]))

  const remarks = buildRiderRemarks(answers)
  const hasPin = toLatLng(answers.delivery_lat, answers.delivery_lng) !== null
  const lockedReason = deliveryEditRefusal({ status: order.status, lalamoveOrderId: order.lalamove_order_id, lalamoveStatus: order.lalamove_status })
  const pinKm = text(answers[DELIVERY_PIN_KM_KEY])
  const movedBy = text(answers[DELIVERY_PIN_UPDATED_BY_KEY])

  const handleCopy = async () => {
    const message = buildRiderMessage({ customerName: order.customer_name, customerContact: order.customer_contact, customerData: answers })
    try {
      await navigator.clipboard.writeText(message)
      toast.success('Copied. Paste it to your rider.')
    } catch (error) {
      console.error('[order-delivery] could not copy:', error)
      toast.error('Could not copy. Please select the text and copy it.')
    }
  }

  const handleSendLink = async () => {
    setIsLinking(true)
    const result = await createPinLinkAction(tenantId, order.id)
    setIsLinking(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    setLinkUrl(result.url)
    const shared = await shareLink(result.url)
    if (shared === 'copied') toast.success('Link copied. Send it to the customer. It works for 24 hours.')
    if (shared === 'failed') toast.error('Could not share it. Copy the link below.')
  }

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()
    // Only what changed: the rest may have been moved by the customer since this card loaded.
    const opened: MerchantDeliveryDraft = {
      address: text(answers[DELIVERY_ADDRESS_FIELD_NAME]),
      pin: toLatLng(answers.delivery_lat, answers.delivery_lng),
      ...findDeliveryDetails(answers),
      storeNote: text(answers[DELIVERY_STORE_NOTE_KEY]),
    }
    const patch = merchantDeliveryChanges(opened, { address, pin, unit, landmark, riderNote, storeNote })
    if (Object.keys(patch).length === 0) {
      setIsEditing(false)
      return
    }
    setIsSaving(true)
    const result = await saveDeliveryDetailsAction(tenantId, order.id, patch)
    setIsSaving(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    setAnswers(result.customerData)
    setIsEditing(false)
    toast.success('Delivery details saved. Get a new quote if this order uses Lalamove.')
    router.refresh()
  }

  return (
    <section aria-label="Delivery details" className="space-y-3 rounded-lg border p-4">
      <h4 className="text-sm font-medium">What the rider will read</h4>

      {isPinSkipped(answers) ? (
        <p role="status" className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          The customer couldn&apos;t find their place on the map, and no delivery fee was charged. Call them for the spot and the fee, or send a pin link.
        </p>
      ) : !hasPin ? (
        <p role="status" className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          This order has no pin. Set one, or send the customer a link to set it.
        </p>
      ) : null}

      {movedBy ? (
        <p role="status" className="rounded-md bg-blue-50 p-3 text-sm text-blue-900">
          {movedBy === 'customer' ? 'The customer set this pin.' : 'This pin was changed after the order.'}
          {pinKm ? ` It is about ${pinKm} km from the store.` : ''} The delivery fee stays as it is, so change it if it should be different.
        </p>
      ) : null}

      <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/50 p-3 font-sans text-sm">{remarks || 'Nothing yet.'}</pre>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={handleCopy} disabled={!remarks}>
          <Copy aria-hidden="true" className="mr-1.5 h-4 w-4" />
          Copy for rider
        </Button>
        {!lockedReason ? (
          <>
            <Button type="button" size="sm" variant="outline" onClick={() => setIsEditing((current) => !current)} aria-expanded={isEditing}>
              <Pencil aria-hidden="true" className="mr-1.5 h-4 w-4" />
              Edit details
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleSendLink} disabled={isLinking}>
              <Link2 aria-hidden="true" className="mr-1.5 h-4 w-4" />
              {isLinking ? 'Getting link…' : 'Send pin link'}
            </Button>
          </>
        ) : null}
      </div>

      {linkUrl ? (
        <div className="space-y-1">
          <label htmlFor={`pin-link-${order.id}`} className="text-xs text-muted-foreground">Send this to the customer. It works for 24 hours.</label>
          <input id={`pin-link-${order.id}`} readOnly value={linkUrl} onFocus={(event) => event.target.select()} className={INPUT_CLASS} />
        </div>
      ) : null}

      {lockedReason ? <p className="text-xs text-muted-foreground">{lockedReason}</p> : null}

      {isEditing && !lockedReason ? (
        <form onSubmit={handleSave} className="space-y-3 border-t pt-3">
          <div className="space-y-1">
            <span className="text-sm font-medium">Address and pin</span>
            <AddressAutocomplete
              value={address}
              coordinates={pin}
              onChange={(next, coordinates) => {
                setAddress(next)
                setPin(coordinates ?? null)
              }}
              purpose="delivery"
              mapDisplay="links"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="delivery-unit" className="text-sm font-medium">House / Blk / Lot / Unit</label>
            <input id="delivery-unit" value={unit} onChange={(event) => setUnit(event.target.value)} maxLength={DETAIL_MAX_LENGTH} className={INPUT_CLASS} />
          </div>
          <div className="space-y-1">
            <label htmlFor="delivery-landmark" className="text-sm font-medium">Landmark</label>
            <input id="delivery-landmark" value={landmark} onChange={(event) => setLandmark(event.target.value)} maxLength={DETAIL_MAX_LENGTH} className={INPUT_CLASS} />
          </div>
          <div className="space-y-1">
            <label htmlFor="delivery-rider-note" className="text-sm font-medium">Customer&apos;s note to rider</label>
            <input id="delivery-rider-note" value={riderNote} onChange={(event) => setRiderNote(event.target.value)} maxLength={DETAIL_MAX_LENGTH} className={INPUT_CLASS} />
          </div>
          <div className="space-y-1">
            <label htmlFor="delivery-store-note" className="text-sm font-medium">Store note to rider</label>
            <textarea id="delivery-store-note" value={storeNote} onChange={(event) => setStoreNote(event.target.value)} maxLength={STORE_NOTE_MAX_LENGTH} rows={2} placeholder="e.g. Fragile, keep upright" className={INPUT_CLASS} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save'}</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
          </div>
        </form>
      ) : null}
    </section>
  )
}
