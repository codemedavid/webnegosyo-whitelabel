'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, Download, Search, Inbox, Loader2 } from 'lucide-react'
import type { Lead, LeadStatus } from '@/lib/leads/types'
import { LeadStatusBadge, LEAD_STATUS_CONFIG } from './lead-status-badge'
import { LeadDetailPanel } from './lead-detail-panel'
import { fetchLeads } from '@/app/actions/leads'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Panel, EmptyState } from '@/components/superadmin/ui/primitives'
import { formatNumber } from '@/components/superadmin/ui/format'

const PAGE_SIZE = 20

const STATUS_FILTERS: { label: string; value: LeadStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'New', value: 'new' },
  { label: 'Contacted', value: 'contacted' },
  { label: 'Qualified', value: 'qualified' },
  { label: 'Converted', value: 'converted' },
  { label: 'Lost', value: 'lost' },
]

function avatarClass(status: LeadStatus): string {
  const c = LEAD_STATUS_CONFIG[status]
  return `${c.bg} ${c.text} border ${c.border}`
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?'
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

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
  statusBreakdown?: Record<LeadStatus, number>
}

export function LeadsTable({ initialLeads, initialCount, statusBreakdown }: LeadsTableProps) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [count, setCount] = useState(initialCount)
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all')
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
  const rangeStart = count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, count)
  const hasFilter = statusFilter !== 'all' || debouncedSearch.length > 0

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
    <Panel padding="">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b border-white/10 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div
          className="-mx-1 flex flex-nowrap gap-1.5 overflow-x-auto px-1 pb-1 lg:flex-wrap lg:overflow-visible lg:pb-0"
          role="tablist"
          aria-label="Filter leads by status"
        >
          {STATUS_FILTERS.map((filter) => {
            const filterCount = filter.value === 'all' ? undefined : statusBreakdown?.[filter.value]
            const isActive = statusFilter === filter.value
            return (
              <button
                key={filter.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setStatusFilter(filter.value)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white text-black'
                    : 'border border-white/15 text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                {filter.label}
                {filterCount !== undefined && (
                  <span
                    className={`rounded-full px-1.5 text-xs tabular-nums ${
                      isActive ? 'bg-black/10 text-black/70' : 'bg-white/[0.08] text-white/50'
                    }`}
                  >
                    {filterCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <Input
              type="search"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search leads"
              className="w-full pl-9 sm:w-60"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={leads.length === 0}
            className="shrink-0 gap-1.5"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.02]">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-white/45">
                Lead
              </th>
              <th className="hidden px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-white/45 md:table-cell">
                Contact
              </th>
              <th className="hidden px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-white/45 lg:table-cell">
                Booking
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-white/45">
                Status
              </th>
              <th className="hidden px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-white/45 sm:table-cell">
                Submitted
              </th>
              <th className="w-10 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className={isLoading ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-0">
                  {isLoading ? (
                    <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-white/45">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading leads...
                    </div>
                  ) : hasFilter ? (
                    <EmptyState
                      icon={Search}
                      title="No matching leads"
                      description="Try a different search term or clear the status filter."
                      action={
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSearch('')
                            setStatusFilter('all')
                          }}
                        >
                          Clear filters
                        </Button>
                      }
                    />
                  ) : (
                    <EmptyState
                      icon={Inbox}
                      title="No leads yet"
                      description="Growth-call bookings from your landing page will appear here, ready to qualify and convert into tenants."
                    />
                  )}
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr
                  key={lead.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open details for ${lead.name}`}
                  onClick={() => setSelectedLeadId(lead.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedLeadId(lead.id)
                    }
                  }}
                  className="group cursor-pointer border-b border-white/[0.06] outline-none transition-colors last:border-b-0 hover:bg-white/[0.04] focus-visible:bg-white/[0.04] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/30"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarClass(lead.status)}`}
                      >
                        {getInitials(lead.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-white">{lead.name}</div>
                        <div className="mt-0.5 truncate text-xs capitalize text-white/45">
                          {lead.source.replace(/_/g, ' ')}
                          <span className="md:hidden">
                            {lead.email ? <span className="mx-1 text-white/25">·</span> : null}
                            <span className="normal-case">{lead.email}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="hidden px-4 py-3 md:table-cell">
                    <div className="truncate text-white/80">{lead.email}</div>
                    <div className="mt-0.5 truncate text-xs text-white/45">{lead.phone || '—'}</div>
                  </td>

                  <td className="hidden px-4 py-3 text-white/60 lg:table-cell">
                    {formatBooking(lead.booking_date, lead.booking_time)}
                  </td>

                  <td className="px-4 py-3">
                    <LeadStatusBadge status={lead.status} />
                  </td>

                  <td className="hidden whitespace-nowrap px-4 py-3 text-right text-white/55 sm:table-cell">
                    {timeAgo(lead.created_at)}
                  </td>

                  <td className="px-4 py-3 text-right">
                    <ChevronRight className="ml-auto h-4 w-4 text-white/25 transition-colors group-hover:text-white/60" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {(leads.length > 0 || page > 1) && (
        <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-3 text-sm text-white/55 sm:flex-row sm:items-center sm:justify-between">
          <span className="tabular-nums">
            {count > 0 ? (
              <>
                Showing <span className="text-white/80">{formatNumber(rangeStart)}</span>–
                <span className="text-white/80">{formatNumber(rangeEnd)}</span> of{' '}
                <span className="text-white/80">{formatNumber(count)}</span>
              </>
            ) : (
              'No results'
            )}
          </span>
          <div className="flex items-center gap-2">
            <span className="mr-1 text-xs text-white/35">
              Page {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <LeadDetailPanel
        leadId={selectedLeadId}
        open={!!selectedLeadId}
        onOpenChange={(open) => {
          if (!open) setSelectedLeadId(null)
        }}
        onStatusChange={loadLeads}
      />
    </Panel>
  )
}
