'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Mail, Phone, Building2, FileText, Clock, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { fetchCheckoutLeadDetail, changeCheckoutLeadStatus } from '@/app/actions/checkout-leads'
import { CheckoutLeadStatusBadge } from './checkout-lead-status-badge'
import type { CheckoutLeadStatus, CheckoutLeadWithPaymentMethod, CheckoutLeadStatusHistory } from '@/types/database'

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
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Checkout Lead Details</SheetTitle>
        </SheetHeader>

        {isLoading || !lead ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Reference & Amount */}
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-xs text-muted-foreground">Reference Number</p>
              <p className="font-mono text-lg font-bold">{lead.reference_number}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Amount: <span className="font-medium text-foreground">P{lead.amount.toLocaleString()}</span>
              </p>
            </div>

            {/* Contact Info */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Contact Information</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{lead.business_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-4 w-4 text-center text-muted-foreground">&#128100;</span>
                  <span>{lead.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline">{lead.email}</a>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{lead.phone}</span>
                </div>
                {lead.notes && (
                  <div className="flex items-start gap-2">
                    <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{lead.notes}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Payment Method</h4>
              <p className="text-sm">
                {lead.platform_payment_methods?.name ?? 'Unknown'}
              </p>
            </div>

            {/* Payment Proof */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Payment Proof</h4>
              {lead.payment_proof_url ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-green-600">
                    <ImageIcon className="h-3.5 w-3.5" />
                    Uploaded {lead.payment_proof_uploaded_at
                      ? new Date(lead.payment_proof_uploaded_at).toLocaleString()
                      : ''}
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={lead.payment_proof_url}
                    alt="Payment proof"
                    className="max-h-64 rounded-lg border object-contain"
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No proof uploaded yet</p>
              )}
            </div>

            {/* Status Changer */}
            <div className="space-y-3 rounded-lg border p-4">
              <h4 className="text-sm font-semibold">Change Status</h4>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Current:</span>
                <CheckoutLeadStatusBadge status={lead.status} />
              </div>
              <Select
                value={lead.status}
                onValueChange={(val) => handleStatusChange(val as CheckoutLeadStatus)}
                disabled={isChangingStatus}
              >
                <SelectTrigger>
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
                <Label className="text-xs">Note (optional)</Label>
                <Textarea
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  placeholder="Add a note about this status change..."
                  rows={2}
                  className="text-sm"
                />
              </div>

              {isChangingStatus && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Updating status...
                </div>
              )}
            </div>

            {/* Status History */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Status History</h4>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No status changes yet</p>
              ) : (
                <div className="space-y-2">
                  {history.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-2 text-xs">
                      <Clock className="mt-0.5 h-3 w-3 text-muted-foreground" />
                      <div>
                        <span className="text-muted-foreground">
                          {entry.old_status ?? 'new'} &rarr; {entry.new_status}
                        </span>
                        {entry.note && (
                          <p className="mt-0.5 text-muted-foreground italic">&quot;{entry.note}&quot;</p>
                        )}
                        <p className="text-muted-foreground/70">
                          {new Date(entry.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Timestamps */}
            <div className="text-xs text-muted-foreground">
              <p>Created: {new Date(lead.created_at).toLocaleString()}</p>
              <p>Updated: {new Date(lead.updated_at).toLocaleString()}</p>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
