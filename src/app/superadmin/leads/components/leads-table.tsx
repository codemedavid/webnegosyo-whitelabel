'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronRight } from 'lucide-react'
import type { Lead, LeadStatus } from '@/lib/leads/types'
import { LeadStatusBadge } from './lead-status-badge'
import { LeadDetailPanel } from './lead-detail-panel'
import { fetchLeads } from '@/app/actions/leads'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const PAGE_SIZE = 20

const STATUS_FILTERS: { label: string; value: LeadStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'New', value: 'new' },
  { label: 'Contacted', value: 'contacted' },
  { label: 'Qualified', value: 'qualified' },
  { label: 'Converted', value: 'converted' },
  { label: 'Lost', value: 'lost' },
]

const AVATAR_COLORS: Record<LeadStatus, string> = {
  new: 'bg-blue-50 text-blue-600',
  contacted: 'bg-amber-50 text-amber-600',
  qualified: 'bg-purple-50 text-purple-600',
  converted: 'bg-green-50 text-green-600',
  lost: 'bg-zinc-100 text-zinc-500',
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
    <Card className="overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((filter) => {
            const filterCount = filter.value === 'all'
              ? undefined
              : statusBreakdown?.[filter.value]
            return (
              <button
                key={filter.value}
                onClick={() => setStatusFilter(filter.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  statusFilter === filter.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {filter.label}
                {filterCount !== undefined && (
                  <span className={`ml-1.5 ${statusFilter === filter.value ? 'opacity-70' : 'opacity-50'}`}>
                    {filterCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="search"
            placeholder="Search leads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-52"
          />
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            Export CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Lead
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
              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody className={isLoading ? 'opacity-50' : ''}>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  {isLoading ? 'Loading...' : 'No leads found.'}
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => setSelectedLeadId(lead.id)}
                  className="cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/50"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${AVATAR_COLORS[lead.status]}`}
                      >
                        {getInitials(lead.name)}
                      </div>
                      <div>
                        <div className="font-medium">{lead.name}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{lead.source}</div>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div>{lead.email}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{lead.phone}</div>
                  </td>

                  <td className="px-4 py-3 text-muted-foreground">
                    {formatBooking(lead.booking_date, lead.booking_time)}
                  </td>

                  <td className="px-4 py-3">
                    <LeadStatusBadge status={lead.status} />
                  </td>

                  <td className="px-4 py-3 text-muted-foreground">
                    {timeAgo(lead.created_at)}
                  </td>

                  <td className="px-4 py-3">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <span>
          Page {page} of {totalPages}
          {count > 0 && (
            <span className="ml-2 opacity-60">({count} total)</span>
          )}
        </span>
        <div className="flex items-center gap-2">
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

      <LeadDetailPanel
        leadId={selectedLeadId}
        open={!!selectedLeadId}
        onOpenChange={(open) => { if (!open) setSelectedLeadId(null) }}
        onStatusChange={loadLeads}
      />
    </Card>
  )
}
