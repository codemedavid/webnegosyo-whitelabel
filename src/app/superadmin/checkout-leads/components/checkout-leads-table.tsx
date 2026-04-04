'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Download, ImageIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { fetchCheckoutLeads } from '@/app/actions/checkout-leads'
import { CheckoutLeadStatusBadge } from './checkout-lead-status-badge'
import { CheckoutLeadDetailPanel } from './checkout-lead-detail-panel'
import type { CheckoutLeadStatus, CheckoutLeadWithPaymentMethod } from '@/types/database'

const PAGE_SIZE = 20

const STATUS_TABS: { value: CheckoutLeadStatus | 'all'; label: string }[] = [
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
  const [statusFilter, setStatusFilter] = useState<CheckoutLeadStatus | 'all'>('all')
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

  function handleExportCSV() {
    const headers = ['Reference', 'Name', 'Email', 'Phone', 'Business', 'Payment Method', 'Status', 'Amount', 'Date']
    const rows = leads.map((lead) => [
      lead.reference_number,
      `"${lead.name.replace(/"/g, '""')}"`,
      lead.email,
      lead.phone,
      `"${lead.business_name.replace(/"/g, '""')}"`,
      lead.platform_payment_methods?.name ?? '',
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
      <div className="rounded-xl border bg-white shadow-sm">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, ref..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>

        {/* Status Tabs */}
        <div className="flex gap-1 border-b px-4 pt-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setStatusFilter(tab.value); setPage(1) }}
              className={`rounded-t-md px-3 py-2 text-xs font-medium transition-colors ${
                statusFilter === tab.value
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                <th className="px-4 py-3">Ref #</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Proof</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className={isLoading ? 'opacity-50' : ''}>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    No checkout leads found
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    className="cursor-pointer border-b transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-medium">
                      {lead.reference_number}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{lead.name}</div>
                      <div className="text-xs text-muted-foreground">{lead.email}</div>
                    </td>
                    <td className="px-4 py-3">{lead.business_name}</td>
                    <td className="px-4 py-3 text-xs">
                      {lead.platform_payment_methods?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <CheckoutLeadStatusBadge status={lead.status} />
                    </td>
                    <td className="px-4 py-3">
                      {lead.payment_proof_url ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                          <ImageIcon className="h-3.5 w-3.5" />
                          Uploaded
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, count)} of {count}
            </p>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Panel */}
      <CheckoutLeadDetailPanel
        leadId={selectedLeadId}
        open={!!selectedLeadId}
        onOpenChange={(open) => { if (!open) setSelectedLeadId(null) }}
        onStatusChange={loadLeads}
      />
    </>
  )
}
