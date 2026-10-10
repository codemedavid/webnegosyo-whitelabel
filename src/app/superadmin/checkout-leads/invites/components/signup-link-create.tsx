'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Link2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createOnboardingInviteAction } from '@/app/actions/onboarding-invites'
import { CHECKOUT_PAYMENT_TERMS, type CheckoutPaymentTerm } from '@/lib/checkout-leads/payment-terms'
import { DEFAULT_INVITE_EXPIRY_DAYS, INVITE_EXPIRY_DAYS, type InviteExpiryDays } from '@/lib/onboarding/invites/status'
import { buildSignupLinkMessage } from '@/lib/onboarding/invites/share'
import { DIALOG_FIELD, DIALOG_HINT, DIALOG_LABEL, DIALOG_PRIMARY_BUTTON } from '@/components/superadmin/ui/dialog-tokens'
import { Panel, SectionHeader } from '@/components/superadmin/ui/primitives'
import { usePlatformAccess } from '@/components/superadmin/platform-access-context'
import { getPaymentTermLabel } from '../../components/payment-term'

interface CreateForm {
  label: string
  payment_term: CheckoutPaymentTerm
  expires_in_days: InviteExpiryDays
  notes: string
}

const EMPTY_FORM: CreateForm = { label: '', payment_term: 'monthly_subscription', expires_in_days: DEFAULT_INVITE_EXPIRY_DAYS, notes: '' }
const SHARE_BUTTON = 'inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/[0.06]'

function NewLink({ url, onDone }: { url: string; onDone: () => void }) {
  const message = buildSignupLinkMessage(url)
  const [copied, setCopied] = useState<'link' | 'message' | null>(null)

  async function copy(kind: 'link' | 'message') {
    try {
      await navigator.clipboard.writeText(kind === 'link' ? url : message)
      setCopied(kind)
      toast.success(kind === 'link' ? 'Link copied' : 'Message copied')
    } catch {
      toast.warning('Could not copy — select the text and copy by hand.')
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-3">
      <p className="text-xs font-semibold text-emerald-300">Link ready. Copy it now — it is shown only this once.</p>
      <input readOnly value={url} aria-label="Sign-up link" onFocus={(event) => event.currentTarget.select()}
        className="w-full rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 font-mono text-xs text-white" />
      <textarea readOnly value={message} aria-label="Message to send" rows={6} onFocus={(event) => event.currentTarget.select()}
        className="w-full resize-none rounded-lg border border-white/15 bg-black/30 px-2.5 py-2 text-xs leading-relaxed text-white/85" />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => copy('message')} className={SHARE_BUTTON}>
          {copied === 'message' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy message (Messenger)
        </button>
        <button type="button" onClick={() => copy('link')} className={SHARE_BUTTON}>
          {copied === 'link' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy link
        </button>
        <button type="button" onClick={onDone} className={`${DIALOG_PRIMARY_BUTTON} ml-auto`}>Make another</button>
      </div>
    </div>
  )
}

/** Make a one-time sign-up link; the full link is shown once (only its hash is stored). */
export function SignupLinkCreate() {
  const router = useRouter()
  const canEdit = usePlatformAccess().can('checkout_leads.edit')
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [issuedUrl, setIssuedUrl] = useState<string | null>(null)

  if (!canEdit) return null

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setIsSaving(true)
    setError(null)
    try {
      const result = await createOnboardingInviteAction({ ...form, notes: form.notes.trim() || undefined })
      if (result.error !== null) return setError(result.error)
      setIssuedUrl(`${window.location.origin}${result.path}`)
      setForm(EMPTY_FORM)
      router.refresh()
    } catch (submitError) {
      console.error('[signup-links] create failed', submitError)
      setError('Could not create the link. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Panel className="space-y-4">
      <SectionHeader icon={Link2} title="New sign-up link" subtitle="Works once. Whoever uses it becomes a Paid lead at the plan you pick." />
      {issuedUrl ? (
        <NewLink url={issuedUrl} onDone={() => setIssuedUrl(null)} />
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-3 text-sm sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={DIALOG_LABEL}>Who is it for?</span>
            <input required value={form.label} maxLength={120} placeholder="Juan – paid via GCash" className={DIALOG_FIELD}
              onChange={(event) => setForm({ ...form, label: event.target.value })} />
          </label>
          <label className="block">
            <span className={DIALOG_LABEL}>Plan they paid for</span>
            <select value={form.payment_term} className={DIALOG_FIELD}
              onChange={(event) => setForm({ ...form, payment_term: event.target.value as CheckoutPaymentTerm })}>
              {CHECKOUT_PAYMENT_TERMS.map((term) => <option key={term} value={term} className="bg-black">{getPaymentTermLabel(term)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={DIALOG_LABEL}>Expires after</span>
            <select value={form.expires_in_days} className={DIALOG_FIELD}
              onChange={(event) => setForm({ ...form, expires_in_days: Number(event.target.value) as InviteExpiryDays })}>
              {INVITE_EXPIRY_DAYS.map((days) => <option key={days} value={days} className="bg-black">{days} days</option>)}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className={DIALOG_LABEL}>Notes (optional, copied onto their lead)</span>
            <input value={form.notes} maxLength={1000} placeholder="Paid via GCash, ref 1234" className={DIALOG_FIELD}
              onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
            <p className={DIALOG_HINT}>Only make links for customers whose payment you have received.</p>
            <button type="submit" disabled={isSaving} className={`${DIALOG_PRIMARY_BUTTON} inline-flex items-center gap-1.5`}>
              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Create link
            </button>
          </div>
          {error && <p role="alert" className="text-xs text-red-300 sm:col-span-2">{error}</p>}
        </form>
      )}
    </Panel>
  )
}
