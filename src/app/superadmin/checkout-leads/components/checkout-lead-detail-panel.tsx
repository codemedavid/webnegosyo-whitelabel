'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2,
  Mail,
  Phone,
  Building2,
  FileText,
  Clock,
  ImageIcon,
  User,
  Hash,
  ExternalLink,
  CreditCard,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/components/superadmin/ui/format'
import { fetchCheckoutLeadDetail, changeCheckoutLeadStatus } from '@/app/actions/checkout-leads'
import { CheckoutLeadStatusBadge } from './checkout-lead-status-badge'
import { getPaymentTermLabel } from './payment-term'
import type {
  CheckoutLeadStatus,
  CheckoutLeadWithPaymentMethod,
  CheckoutLeadStatusHistory,
} from '@/types/database'

const ALL_STATUSES: { value: CheckoutLeadStatus; label: string }[] = [
  { value: 'initiated', label: 'Initiated' },
  { value: 'paid', label: 'Paid' },
  { value: 'setup_in_progress', label: 'Setting Up' },
  { value: 'live', label: 'Live' },
  { value: 'cancelled', label: 'Cancelled' },
]

interface CheckoutLeadDetailPanelProps {
  leadId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onStatusChange: () => void
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[11px] font-medium uppercase tracking-wider text-white/45">{children}</h4>
  )
}

export function CheckoutLeadDetailPanel({
  leadId,
  open,
  onOpenChange,
  onStatusChange,
}: CheckoutLeadDetailPanelProps) {
  const [lead, setLead] = useState<CheckoutLeadWithPaymentMethod | null>(null)
  const [history, setHistory] = useState<CheckoutLeadStatusHistory[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isChangingStatus, setIsChangingStatus] = useState(false)
  const [statusNote, setStatusNote] = useState('')

  const loadDetail = useCallback(async () => {
    if (!leadId) return
    setIsLoading(true)
    try {
      const result = await fetchCheckoutLeadDetail(leadId)
      setLead(result.lead ?? null)
      setHistory(result.history ?? [])
    } finally {
      setIsLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    if (open && leadId) {
      loadDetail()
    }
  }, [open, leadId, loadDetail])

  async function handleStatusChange(newStatus: CheckoutLeadStatus) {
    if (!lead || newStatus === lead.status || isChangingStatus) return
    setIsChangingStatus(true)
    try {
      const result = await changeCheckoutLeadStatus(
        lead.id,
        lead.status,
        newStatus,
        undefined,
        statusNote || undefined
      )
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Status changed to ${newStatus}`)
        setStatusNote('')
        await loadDetail()
        onStatusChange()
      }
    } finally {
      setIsChangingStatus(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto border-white/10 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="text-white">Checkout lead</SheetTitle>
        </SheetHeader>

        {isLoading || !lead ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-white/45" />
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            {/* Hero — reference, amount, status */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-white/45">
                    <Hash className="h-3 w-3" />
                    Reference
                  </p>
                  <p className="mt-1 font-mono text-lg font-bold text-white">{lead.reference_number}</p>
                </div>
                <CheckoutLeadStatusBadge status={lead.status} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <p className="text-[11px] uppercase tracking-wider text-white/45">Amount</p>
                  <p className="mt-0.5 text-xl font-bold tabular-nums text-white">
                    {formatCurrency(lead.amount)}
                  </p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <p className="text-[11px] uppercase tracking-wider text-white/45">Term</p>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-white">
                    <Wallet className="h-3.5 w-3.5 text-white/45" />
                    {getPaymentTermLabel(lead.payment_term)}
                  </p>
                </div>
              </div>
            </div>

            {/* Contact */}
            <div className="space-y-3">
              <SectionLabel>Contact</SectionLabel>
              <div className="space-y-2.5 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm">
                <div className="flex items-center gap-2.5">
                  <Building2 className="h-4 w-4 shrink-0 text-white/45" />
                  <span className="font-medium text-white">{lead.business_name}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <User className="h-4 w-4 shrink-0 text-white/45" />
                  <span className="text-white/80">{lead.name}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Mail className="h-4 w-4 shrink-0 text-white/45" />
                  <a href={`mailto:${lead.email}`} className="truncate text-sky-400 hover:underline">
                    {lead.email}
                  </a>
                </div>
                <div className="flex items-center gap-2.5">
                  <Phone className="h-4 w-4 shrink-0 text-white/45" />
                  <a href={`tel:${lead.phone}`} className="text-white/80 hover:text-white">
                    {lead.phone}
                  </a>
                </div>
                {lead.notes && (
                  <div className="flex items-start gap-2.5 border-t border-white/[0.06] pt-2.5">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-white/45" />
                    <span className="text-white/60">{lead.notes}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Payment method + proof */}
            <div className="space-y-3">
              <SectionLabel>Payment</SectionLabel>
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-center gap-2.5 text-sm">
                  <CreditCard className="h-4 w-4 shrink-0 text-white/45" />
                  <span className="text-white/80">
                    {lead.platform_payment_methods?.name ?? 'Unknown method'}
                  </span>
                </div>

                <div className="mt-4 border-t border-white/[0.06] pt-4">
                  {lead.payment_proof_url ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                          <ImageIcon className="h-3.5 w-3.5" />
                          Proof uploaded
                        </span>
                        <a
                          href={lead.payment_proof_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-white/55 hover:text-white"
                        >
                          Open full
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      <a
                        href={lead.payment_proof_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block overflow-hidden rounded-xl border border-white/10"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={lead.payment_proof_url}
                          alt="Payment proof"
                          className="max-h-72 w-full bg-black/40 object-contain"
                        />
                      </a>
                      {lead.payment_proof_uploaded_at && (
                        <p className="text-[11px] text-white/35">
                          {new Date(lead.payment_proof_uploaded_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1.5 py-4 text-center">
                      <ImageIcon className="h-6 w-6 text-white/20" />
                      <p className="text-xs text-white/45">No payment proof uploaded yet</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Status changer */}
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <SectionLabel>Update status</SectionLabel>
              <Select
                value={lead.status}
                onValueChange={(val) => handleStatusChange(val as CheckoutLeadStatus)}
                disabled={isChangingStatus}
              >
                <SelectTrigger aria-label="Change lead status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="space-y-1.5">
                <Label className="text-xs text-white/55">Note (optional)</Label>
                <Textarea
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  placeholder="Add a note about this status change…"
                  rows={2}
                  className="text-sm"
                />
              </div>

              {isChangingStatus && (
                <div className="flex items-center gap-2 text-xs text-white/45">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Updating status…
                </div>
              )}
            </div>

            {/* Status history timeline */}
            <div className="space-y-3">
              <SectionLabel>History</SectionLabel>
              {history.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white/45">
                  No status changes yet
                </p>
              ) : (
                <ol className="relative space-y-4 border-l border-white/10 pl-5">
                  {history.map((entry) => (
                    <li key={entry.id} className="relative">
                      <span className="absolute -left-[1.4rem] top-1 flex h-3 w-3 items-center justify-center">
                        <Clock className="h-3 w-3 text-white/35" />
                      </span>
                      <p className="text-xs text-white/70">
                        <span className="text-white/45">{entry.old_status ?? 'new'}</span>
                        <span className="mx-1 text-white/35">→</span>
                        <span className="font-medium text-white">{entry.new_status}</span>
                      </p>
                      {entry.note && (
                        <p className="mt-0.5 text-xs italic text-white/55">&quot;{entry.note}&quot;</p>
                      )}
                      <p className="mt-0.5 text-[11px] text-white/35">
                        {new Date(entry.created_at).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* Timestamps */}
            <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-white/[0.06] pt-4 text-[11px] text-white/40">
              <p>Created {new Date(lead.created_at).toLocaleString()}</p>
              <p>Updated {new Date(lead.updated_at).toLocaleString()}</p>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
