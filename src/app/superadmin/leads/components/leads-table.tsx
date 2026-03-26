'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Lead, LeadStatus } from '@/lib/leads/types'
import { LeadStatusBadge } from './lead-status-badge'
import { LeadDetailPanel } from './lead-detail-panel'
import { fetchLeads } from '@/app/actions/leads'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const PAGE_SIZE = 20

const STATUS_FILTERS: { label: string; value: LeadStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'New', value: 'new' },
  { label: 'Contacted', value: 'contacted' },
  { label: 'Qualified', value: 'qualified' },
  { label: 'Converted', value: 'converted' },
  { label: 'Lost', value: 'lost' },
]

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)

  if (diffSeconds < 60) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes} min ago`
  if (diffHours < 24) return `${diffHours} hr${diffHours !== 1 ? 's' : ''} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
  if (diffWeeks < 5) return `${diffWeeks} week${diffWeeks !== 1 ? 's' : ''} ago`
  return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`
}

function formatBooking(date: string, time: string): string {
  if (!date) return '—'
  try {
    const d = new Date(`${date}T${time || '00:00'}`)
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return date
  }
}

function leadsToCSV(leads: Lead[]): string {
  const headers = ['Name', 'Email', 'Phone', 'Source', 'Booking Date', 'Booking Time', 'Status', 'Submitted']
  const rows = leads.map((lead) => [
    `"${lead.name.replace(/"/g, '""')}"`,
    `"${lead.email.replace(/"/g, '""')}"`,
    `"${lead.phone.replace(/"/g, '""')}"`,
    `"${lead.source.replace(/"/g, '""')}"`,
    `"${lead.booking_date}"`,
    `"${lead.booking_time}"`,
    `"${lead.status}"`,
    `"${new Date(lead.created_at).toISOString()}"`,
  ])
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
}

interface LeadsTableProps {
  initialLeads: Lead[]
  initialCount: number
}

export function LeadsTable({ initialLeads, initialCount }: LeadsTableProps) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [count, setCount] = useState(initialCount)
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // Reset page when filter changes
  useEffect(() => {
    setPage(1)
  }, [statusFilter])

  const loadLeads = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await fetchLeads({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: debouncedSearch || undefined,
        page,
      })
      setLeads(result.data ?? [])
      setCount(result.count ?? 0)
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, debouncedSearch, page])

  useEffect(() => {
    loadLeads()
  }, [loadLeads])

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))

  function handleExportCSV() {
    const csv = leadsToCSV(leads)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Status filter pills */}
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                statusFilter === filter.value
                  ? 'bg-amber-500 text-zinc-900'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Search + Export */}
        <div className="flex items-center gap-2">
          <Input
            type="search"
            placeholder="Search leads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-52 border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-amber-500"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/50">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Contact
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Booking
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Submitted
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className={isLoading ? 'opacity-50' : ''}>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                  {isLoading ? 'Loading...' : 'No leads found.'}
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30"
                >
                  {/* Name + source */}
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-100">{lead.name}</div>
                    <div className="mt-0.5 text-xs text-zinc-500">{lead.source}</div>
                  </td>

                  {/* Email + phone */}
                  <td className="px-4 py-3">
                    <div className="text-zinc-200">{lead.email}</div>
                    <div className="mt-0.5 text-xs text-zinc-400">{lead.phone}</div>
                  </td>

                  {/* Booking date/time */}
                  <td className="px-4 py-3 text-zinc-300">
                    {formatBooking(lead.booking_date, lead.booking_time)}
                  </td>

                  {/* Status badge */}
                  <td className="px-4 py-3">
                    <LeadStatusBadge status={lead.status} />
                  </td>

                  {/* Submitted relative time */}
                  <td className="px-4 py-3 text-zinc-400">
                    {timeAgo(lead.created_at)}
                  </td>

                  {/* View action */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelectedLeadId(lead.id)}
                      className="text-amber-500 hover:text-amber-400 transition-colors font-medium"
                    >
                      View →
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-zinc-400">
        <span>
          Page {page} of {totalPages}
          {count > 0 && (
            <span className="ml-2 text-zinc-500">({count} total)</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-40"
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || isLoading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-40"
          >
            Next
          </Button>
        </div>
      </div>

      <LeadDetailPanel
        leadId={selectedLeadId}
        open={!!selectedLeadId}
        onOpenChange={(open) => { if (!open) setSelectedLeadId(null) }}
        onStatusChange={loadLeads}
      />
    </div>
  )
}
