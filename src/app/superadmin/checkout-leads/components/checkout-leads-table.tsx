'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Download, ImageIcon, Inbox, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { RangeTabs, EmptyState } from '@/components/superadmin/ui/primitives'
import { formatCurrency } from '@/components/superadmin/ui/format'
import { fetchCheckoutLeads } from '@/app/actions/checkout-leads'
import { CheckoutLeadStatusBadge } from './checkout-lead-status-badge'
import { CheckoutLeadDetailPanel } from './checkout-lead-detail-panel'
import { getPaymentTermLabel } from './payment-term'
import type { CheckoutLeadStatus, CheckoutLeadWithPaymentMethod } from '@/types/database'

const PAGE_SIZE = 20

type StatusFilter = CheckoutLeadStatus | 'all'

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'initiated', label: 'Initiated' },
  { value: 'paid', label: 'Paid' },
  { value: 'setup_in_progress', label: 'Setting Up' },
  { value: 'live', label: 'Live' },
  { value: 'cancelled', label: 'Cancelled' },
]

interface CheckoutLeadsTableProps {
  initialLeads: CheckoutLeadWithPaymentMethod[]
  initialCount: number
}

export function CheckoutLeadsTable({ initialLeads, initialCount }: CheckoutLeadsTableProps) {
  const [leads, setLeads] = useState(initialLeads)
  const [count, setCount] = useState(initialCount)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const loadLeads = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await fetchCheckoutLeads({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: debouncedSearch || undefined,
        page,
      })
      setLeads(result.data)
      setCount(result.count)
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, debouncedSearch, page])

  useEffect(() => {
    loadLeads()
  }, [loadLeads])

  const totalPages = Math.ceil(count / PAGE_SIZE)
  const rangeStart = count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, count)

  function handleExportCSV() {
    const headers = ['Reference', 'Name', 'Email', 'Phone', 'Business', 'Payment Method', 'Term', 'Status', 'Amount', 'Date']
    const rows = leads.map((lead) => [
      lead.reference_number,
      `"${lead.name.replace(/"/g, '""')}"`,
      lead.email,
      lead.phone,
      `"${lead.business_name.replace(/"/g, '""')}"`,
      lead.platform_payment_methods?.name ?? '',
      getPaymentTermLabel(lead.payment_term),
      lead.status,
      lead.amount,
      new Date(lead.created_at).toLocaleDateString(),
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `checkout-leads-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <Input
              placeholder="Search by name, email, ref…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Search checkout leads"
            />
            {isLoading && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/35" />
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={leads.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-3 overflow-x-auto border-b border-white/10 px-4 py-3">
          <RangeTabs<StatusFilter>
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val)
              setPage(1)
            }}
            options={STATUS_TABS}
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[11px] font-medium uppercase tracking-wider text-white/45">
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Business</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Term</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-center font-medium">Proof</th>
                <th className="px-4 py-3 text-right font-medium">Date</th>
              </tr>
            </thead>
            <tbody className={isLoading ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6">
                    <EmptyState
                      icon={Inbox}
                      title="No checkout leads found"
                      description={
                        debouncedSearch || statusFilter !== 'all'
                          ? 'Try adjusting your search or filter.'
                          : 'New checkout leads will appear here.'
                      }
                    />
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    className="group cursor-pointer border-b border-white/[0.06] transition-colors last:border-0 hover:bg-white/[0.04]"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-medium text-white">
                        {lead.reference_number}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-white">{lead.business_name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-white/80">{lead.name}</div>
                      <div className="text-xs text-white/45">{lead.email}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-white">
                      {formatCurrency(lead.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-white/60">{getPaymentTermLabel(lead.payment_term)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <CheckoutLeadStatusBadge status={lead.status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {lead.payment_proof_url ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400"
                          title="Payment proof uploaded"
                        >
                          <ImageIcon className="h-3 w-3" />
                          Proof
                        </span>
                      ) : (
                        <span className="text-xs text-white/30" aria-label="No proof">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-white/45">
                      {new Date(lead.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {(totalPages > 1 || count > 0) && (
          <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-white/45">
              Showing <span className="font-medium text-white/70">{rangeStart}</span>–
              <span className="font-medium text-white/70">{rangeEnd}</span> of{' '}
              <span className="font-medium text-white/70">{count}</span>
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/45">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1 || isLoading}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || isLoading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail Panel */}
      <CheckoutLeadDetailPanel
        leadId={selectedLeadId}
        open={!!selectedLeadId}
        onOpenChange={(open) => {
          if (!open) setSelectedLeadId(null)
        }}
        onStatusChange={loadLeads}
      />
    </>
  )
}
