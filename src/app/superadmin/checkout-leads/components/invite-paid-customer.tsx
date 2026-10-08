'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, UserPlus, X } from 'lucide-react'
import { invitePaidCustomer } from '@/app/actions/checkout-leads'
import { CHECKOUT_PAYMENT_TERMS, type CheckoutPaymentTerm } from '@/lib/checkout-leads/payment-terms'
import { DIALOG_CANCEL_BUTTON, DIALOG_FIELD, DIALOG_HINT, DIALOG_LABEL, DIALOG_PRIMARY_BUTTON } from '@/components/superadmin/ui/dialog-tokens'
import { usePlatformAccess } from '@/components/superadmin/platform-access-context'
import { getPaymentTermLabel } from './payment-term'
import { SetupInviteShare } from './setup-invite-share'

interface InviteForm {
  name: string
  email: string
  phone: string
  business_name: string
  payment_term: CheckoutPaymentTerm
  notes: string
}

const EMPTY_FORM: InviteForm = { name: '', email: '', phone: '', business_name: '', payment_term: 'monthly_subscription', notes: '' }

const FIELDS: ReadonlyArray<{ key: 'business_name' | 'name' | 'email' | 'phone'; label: string; type: string; placeholder: string }> = [
  { key: 'business_name', label: 'Business name', type: 'text', placeholder: "Juan's Kitchen" },
  { key: 'name', label: 'Owner name', type: 'text', placeholder: 'Juan dela Cruz' },
  { key: 'email', label: 'Email (becomes their login)', type: 'email', placeholder: 'juan@example.com' },
  { key: 'phone', label: 'Mobile number', type: 'tel', placeholder: '0917 123 4567' },
]

/**
 * For a customer who paid outside the funnel (Messenger, cash, bank): record
 * them as a paid lead and hand staff their set-up link, ready to send.
 */
export function InvitePaidCustomer() {
  const router = useRouter()
  const canEdit = usePlatformAccess().can('checkout_leads.edit')
  const [isOpen, setIsOpen] = useState(false)
  const [form, setForm] = useState<InviteForm>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [issued, setIssued] = useState<{ url: string; contact: InviteForm } | null>(null)

  if (!canEdit) return null

  function close() {
    setIsOpen(false)
    setForm(EMPTY_FORM)
    setError(null)
    setIssued(null)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setIsSaving(true)
    setError(null)
    try {
      const result = await invitePaidCustomer({ ...form, notes: form.notes.trim() || undefined })
      if (result.error || !result.path) return setError(result.error ?? 'Could not create the invite.')
      setIssued({ url: `${window.location.origin}${result.path}`, contact: form })
      router.refresh()
    } catch (submitError) {
      console.error('[checkout-leads] invite failed', submitError)
      setError('Could not create the invite. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90">
        <UserPlus className="h-3.5 w-3.5" /> Invite paid customer
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="invite-title">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0b0b] p-5 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="invite-title" className="text-base font-semibold text-white">Invite a paid customer</h2>
                <p className="mt-0.5 text-xs text-white/50">They get a private link to build their store and go live.</p>
              </div>
              <button type="button" onClick={close} aria-label="Close" className="rounded-lg p-1.5 text-white/50 hover:bg-white/[0.06] hover:text-white"><X className="h-4 w-4" /></button>
            </div>

            {issued ? (
              <div className="mt-4 space-y-4">
                <SetupInviteShare url={issued.url} contact={{ name: issued.contact.name, businessName: issued.contact.business_name, phone: issued.contact.phone, email: issued.contact.email }} />
                <div className="flex justify-end"><button type="button" onClick={close} className={DIALOG_PRIMARY_BUTTON}>Done</button></div>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-4 space-y-3">
                {FIELDS.map((field) => (
                  <label key={field.key} className="block">
                    <span className={DIALOG_LABEL}>{field.label}</span>
                    <input type={field.type} required value={form[field.key]} placeholder={field.placeholder} className={DIALOG_FIELD}
                      onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} />
                  </label>
                ))}
                <label className="block">
                  <span className={DIALOG_LABEL}>Plan they paid for</span>
                  <select value={form.payment_term} className={DIALOG_FIELD} onChange={(e) => setForm({ ...form, payment_term: e.target.value as CheckoutPaymentTerm })}>
                    {CHECKOUT_PAYMENT_TERMS.map((term) => <option key={term} value={term} className="bg-black">{getPaymentTermLabel(term)}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className={DIALOG_LABEL}>Notes (optional)</span>
                  <input value={form.notes} placeholder="Paid via GCash, ref 1234" className={DIALOG_FIELD} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </label>
                <p className={DIALOG_HINT}>Saved as a lead already marked Paid, so only invite customers whose payment you have received.</p>
                {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={close} className={DIALOG_CANCEL_BUTTON}>Cancel</button>
                  <button type="submit" disabled={isSaving} className={`${DIALOG_PRIMARY_BUTTON} inline-flex items-center gap-1.5`}>
                    {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Create & get link
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
