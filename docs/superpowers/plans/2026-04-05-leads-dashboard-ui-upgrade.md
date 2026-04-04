# Leads Dashboard UI Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the leads dashboard UI to match the rest of the superadmin area — semantic theme tokens, icon-badged stat cards, status pipeline bar, upgraded table with avatars and dot badges.

**Architecture:** Pure UI refactor across 9 files. One new component (`LeadStatusPipeline`), one minor data addition (`statusBreakdown` in `LeadStats`). All other changes are token/class swaps and layout upgrades within existing components.

**Tech Stack:** Next.js 15 App Router, React, TypeScript, Tailwind CSS, shadcn/ui (Card, Button, Input, Sheet, Textarea), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-04-05-leads-dashboard-ui-upgrade-design.md`

---

### Task 1: Add `statusBreakdown` to types and analytics service

**Files:**
- Modify: `src/lib/leads/types.ts:35-43`
- Modify: `src/lib/leads/leads-analytics.ts:25-77` and `162-170`

- [ ] **Step 1: Add `statusBreakdown` to `LeadStats` interface**

In `src/lib/leads/types.ts`, add the field to the `LeadStats` interface:

```typescript
export interface LeadStats {
  totalLeads: number
  newThisWeek: number
  conversionRate: number
  conversionDelta: number
  pendingCalls: number
  pendingToday: number
  avgResponseTimeHours: number
  statusBreakdown: Record<LeadStatus, number>
}
```

- [ ] **Step 2: Add status count query to `getLeadStats()`**

In `src/lib/leads/leads-analytics.ts`, add an 8th parallel query to the `Promise.all` array after `historyResult`:

```typescript
    // 8. Status breakdown — count per status
    supabase
      .from('leads')
      .select('status'),
```

Update the destructuring to capture it:

```typescript
  const [
    totalResult,
    newThisWeekResult,
    currentMonthResult,
    prevMonthResult,
    pendingCallsResult,
    pendingTodayResult,
    historyResult,
    statusBreakdownResult,
  ] = await Promise.all([
```

- [ ] **Step 3: Compute `statusBreakdown` from query results**

Add this processing block after the `// 5 & 6. Pending calls` section (around line 111):

```typescript
  // 8. Status breakdown
  const statusRows: { status: string }[] = (statusBreakdownResult.data as { status: string }[] | null) ?? []
  const statusBreakdown: Record<LeadStatus, number> = {
    new: 0,
    contacted: 0,
    qualified: 0,
    converted: 0,
    lost: 0,
  }
  for (const row of statusRows) {
    if (row.status in statusBreakdown) {
      statusBreakdown[row.status as LeadStatus]++
    }
  }
```

- [ ] **Step 4: Add `statusBreakdown` to the return object**

Update the return statement to include the new field:

```typescript
  return {
    totalLeads,
    newThisWeek,
    conversionRate,
    conversionDelta,
    pendingCalls,
    pendingToday,
    avgResponseTimeHours,
    statusBreakdown,
  }
```

- [ ] **Step 5: Verify build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No new errors related to `LeadStats` or `statusBreakdown`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/leads/types.ts src/lib/leads/leads-analytics.ts
git commit -m "feat(leads): add statusBreakdown to LeadStats for pipeline bar"
```

---

### Task 2: Upgrade `LeadStatusBadge` to dot + label design

**Files:**
- Modify: `src/app/superadmin/leads/components/lead-status-badge.tsx`

- [ ] **Step 1: Replace the entire file with the upgraded dot + label badge**

Replace the full contents of `src/app/superadmin/leads/components/lead-status-badge.tsx`:

```tsx
import type { LeadStatus } from '@/lib/leads/types'

const STATUS_CONFIG: Record<LeadStatus, { label: string; bg: string; text: string; dot: string }> = {
  new: { label: 'New', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  contacted: { label: 'Contacted', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  qualified: { label: 'Qualified', bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  converted: { label: 'Converted', bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  lost: { label: 'Lost', bg: 'bg-zinc-100', text: 'text-zinc-500', dot: 'bg-zinc-400' },
}

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const config = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  )
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/superadmin/leads/components/lead-status-badge.tsx
git commit -m "feat(leads): upgrade status badge to dot + label design"
```

---

### Task 3: Upgrade `LeadAnalytics` stat cards with icon badges

**Files:**
- Modify: `src/app/superadmin/leads/components/lead-analytics.tsx`

- [ ] **Step 1: Replace the entire file with the icon-badged stat cards**

Replace the full contents of `src/app/superadmin/leads/components/lead-analytics.tsx`:

```tsx
'use client'

import { Users, TrendingUp, Phone, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { LeadStats } from '@/lib/leads/types'

export function LeadAnalytics({ stats }: { stats: LeadStats }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Total Leads */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <p className="text-sm font-medium text-muted-foreground">Total Leads</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
              <Users className="h-4.5 w-4.5 text-blue-600" />
            </div>
          </div>
          <div className="mt-2 text-3xl font-bold">{stats.totalLeads}</div>
          <p className="mt-1 text-xs text-green-600">
            ↑ {stats.newThisWeek} this week
          </p>
        </CardContent>
      </Card>

      {/* Conversion Rate */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <p className="text-sm font-medium text-muted-foreground">Conversion Rate</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50">
              <TrendingUp className="h-4.5 w-4.5 text-green-600" />
            </div>
          </div>
          <div className="mt-2 text-3xl font-bold">{stats.conversionRate}%</div>
          <p className={`mt-1 text-xs ${stats.conversionDelta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {stats.conversionDelta >= 0 ? '↑' : '↓'} {Math.abs(stats.conversionDelta)}% vs last month
          </p>
        </CardContent>
      </Card>

      {/* Pending Calls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <p className="text-sm font-medium text-muted-foreground">Pending Calls</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
              <Phone className="h-4.5 w-4.5 text-amber-600" />
            </div>
          </div>
          <div className="mt-2 text-3xl font-bold">{stats.pendingCalls}</div>
          <p className="mt-1 text-xs text-amber-600">
            {stats.pendingToday} scheduled today
          </p>
        </CardContent>
      </Card>

      {/* Avg Response Time */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <p className="text-sm font-medium text-muted-foreground">Avg Response Time</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50">
              <Clock className="h-4.5 w-4.5 text-purple-600" />
            </div>
          </div>
          <div className="mt-2 text-3xl font-bold">{stats.avgResponseTimeHours}h</div>
          <p className={`mt-1 text-xs ${stats.avgResponseTimeHours <= 2 ? 'text-green-600' : 'text-red-600'}`}>
            {stats.avgResponseTimeHours <= 2 ? 'On target (<2h)' : 'Slower than target'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/superadmin/leads/components/lead-analytics.tsx
git commit -m "feat(leads): upgrade stat cards with icon badges"
```

---

### Task 4: Create `LeadStatusPipeline` component

**Files:**
- Create: `src/app/superadmin/leads/components/lead-status-pipeline.tsx`

- [ ] **Step 1: Create the pipeline component file**

Create `src/app/superadmin/leads/components/lead-status-pipeline.tsx`:

```tsx
import { Card, CardContent } from '@/components/ui/card'
import type { LeadStatus } from '@/lib/leads/types'

const PIPELINE_SEGMENTS: { status: LeadStatus; label: string; color: string; dot: string }[] = [
  { status: 'new', label: 'New', color: 'bg-blue-500', dot: 'bg-blue-500' },
  { status: 'contacted', label: 'Contacted', color: 'bg-amber-500', dot: 'bg-amber-500' },
  { status: 'qualified', label: 'Qualified', color: 'bg-purple-500', dot: 'bg-purple-500' },
  { status: 'converted', label: 'Converted', color: 'bg-green-500', dot: 'bg-green-500' },
  { status: 'lost', label: 'Lost', color: 'bg-zinc-300', dot: 'bg-zinc-300' },
]

interface LeadStatusPipelineProps {
  statusBreakdown: Record<LeadStatus, number>
}

export function LeadStatusPipeline({ statusBreakdown }: LeadStatusPipelineProps) {
  const total = Object.values(statusBreakdown).reduce((sum, n) => sum + n, 0)

  return (
    <Card>
      <CardContent className="pt-6">
        {/* Segmented bar */}
        {total > 0 ? (
          <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
            {PIPELINE_SEGMENTS.map((seg) => {
              const count = statusBreakdown[seg.status]
              if (count === 0) return null
              return (
                <div
                  key={seg.status}
                  className={seg.color}
                  style={{ flex: count }}
                />
              )
            })}
          </div>
        ) : (
          <div className="h-2 rounded-full bg-muted" />
        )}

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          {PIPELINE_SEGMENTS.map((seg) => (
            <div key={seg.status} className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${seg.dot}`} />
              <span className="text-sm text-muted-foreground">{seg.label}</span>
              <span className="text-sm font-semibold">{statusBreakdown[seg.status]}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/superadmin/leads/components/lead-status-pipeline.tsx
git commit -m "feat(leads): add status pipeline bar component"
```

---

### Task 5: Upgrade `LeadsTable` with semantic tokens, avatars, and card wrapper

**Files:**
- Modify: `src/app/superadmin/leads/components/leads-table.tsx`

- [ ] **Step 1: Replace the entire file with the upgraded table**

Replace the full contents of `src/app/superadmin/leads/components/leads-table.tsx`:

```tsx
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
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/superadmin/leads/components/leads-table.tsx
git commit -m "feat(leads): upgrade table with semantic tokens, avatars, card wrapper"
```

---

### Task 6: Upgrade `LeadDetailPanel` with semantic tokens

**Files:**
- Modify: `src/app/superadmin/leads/components/lead-detail-panel.tsx`

- [ ] **Step 1: Replace the entire file with the semantic-token version**

Replace the full contents of `src/app/superadmin/leads/components/lead-detail-panel.tsx`:

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { fetchLeadDetail, changeLeadStatus, addLeadNote } from '@/app/actions/leads'
import type { LeadStatus, Lead, LeadNote, LeadStatusHistoryEntry } from '@/lib/leads/types'

interface LeadDetailPanelProps {
  leadId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onStatusChange: () => void
}

const STATUS_OPTIONS: { value: LeadStatus; label: string; activeClass: string }[] = [
  { value: 'new', label: 'New', activeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'contacted', label: 'Contacted', activeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'qualified', label: 'Qualified', activeClass: 'bg-purple-50 text-purple-700 border-purple-200' },
  { value: 'converted', label: 'Converted', activeClass: 'bg-green-50 text-green-700 border-green-200' },
  { value: 'lost', label: 'Lost', activeClass: 'bg-zinc-100 text-zinc-500 border-zinc-200' },
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

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(`${dateStr}T00:00:00`)
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function formatTime(timeStr: string): string {
  if (!timeStr) return '—'
  try {
    const [hours, minutes] = timeStr.split(':').map(Number)
    const d = new Date()
    d.setHours(hours, minutes, 0, 0)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {
    return timeStr
  }
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

export function LeadDetailPanel({
  leadId,
  open,
  onOpenChange,
  onStatusChange,
}: LeadDetailPanelProps) {
  const [lead, setLead] = useState<Lead | null>(null)
  const [notes, setNotes] = useState<LeadNote[]>([])
  const [history, setHistory] = useState<LeadStatusHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [isChangingStatus, setIsChangingStatus] = useState(false)

  const loadDetail = useCallback(async () => {
    if (!leadId) return
    setIsLoading(true)
    try {
      const result = await fetchLeadDetail(leadId)
      setLead(result.lead ?? null)
      setNotes(result.notes.data ?? [])
      setHistory(result.history.data ?? [])
    } finally {
      setIsLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    if (open && leadId) {
      loadDetail()
    }
  }, [open, leadId, loadDetail])

  async function handleStatusChange(newStatus: LeadStatus) {
    if (!lead || newStatus === lead.status || isChangingStatus) return
    setIsChangingStatus(true)
    try {
      await changeLeadStatus(lead.id, lead.status, newStatus)
      await loadDetail()
      onStatusChange()
    } finally {
      setIsChangingStatus(false)
    }
  }

  async function handleSaveNote() {
    if (!lead || !noteText.trim() || isSavingNote) return
    setIsSavingNote(true)
    try {
      await addLeadNote(lead.id, noteText.trim())
      setNoteText('')
      await loadDetail()
    } finally {
      setIsSavingNote(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col gap-0 overflow-y-auto p-0 sm:max-w-md"
      >
        {isLoading || !lead ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-muted-foreground">{isLoading ? 'Loading...' : 'No lead selected.'}</div>
          </div>
        ) : (
          <div className="flex flex-col gap-6 p-6">
            <SheetHeader className="p-0">
              <SheetTitle className="sr-only">{lead.name} — Lead Detail</SheetTitle>
            </SheetHeader>

            {/* 1. Header: Avatar + name + contact */}
            <div className="flex items-center gap-4">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold ${AVATAR_COLORS[lead.status]}`}
              >
                {getInitials(lead.name)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold">{lead.name}</div>
                <div className="mt-0.5 truncate text-sm text-muted-foreground">
                  {lead.email}
                  {lead.phone ? <span className="mx-1 opacity-40">·</span> : null}
                  {lead.phone && <span>{lead.phone}</span>}
                </div>
              </div>
            </div>

            {/* 2. Status changer */}
            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Status
              </div>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((opt) => {
                  const isActive = lead.status === opt.value
                  return (
                    <button
                      key={opt.value}
                      disabled={isChangingStatus}
                      onClick={() => handleStatusChange(opt.value)}
                      className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        isActive
                          ? opt.activeClass
                          : 'border-border bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 3. Booking info */}
            {lead.booking_date && (
              <div className="rounded-lg border bg-muted p-4">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Booking
                </div>
                <div className="text-sm font-medium">
                  {formatDate(lead.booking_date)}
                </div>
                {lead.booking_time && (
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    {formatTime(lead.booking_time)}
                  </div>
                )}
                <div className="mt-2 text-xs text-muted-foreground opacity-60">15-minute growth call</div>
              </div>
            )}

            {/* 4. Notes */}
            <div>
              <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Notes
              </div>
              {notes.length > 0 ? (
                <ul className="mb-4 space-y-3">
                  {notes.map((n) => (
                    <li key={n.id} className="rounded-lg border bg-muted p-3">
                      <p className="text-sm">{n.note}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{timeAgo(n.created_at)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-4 text-sm text-muted-foreground">No notes yet.</p>
              )}
              <Textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note..."
                rows={3}
              />
              <Button
                size="sm"
                disabled={!noteText.trim() || isSavingNote}
                onClick={handleSaveNote}
                className="mt-2"
              >
                {isSavingNote ? 'Saving...' : 'Save Note'}
              </Button>
            </div>

            {/* 5. Status history */}
            {history.length > 0 && (
              <div>
                <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Status History
                </div>
                <div className="border-l-2 border-border pl-4 space-y-4">
                  {history.map((entry) => (
                    <div key={entry.id}>
                      <p className="text-sm">
                        Status changed to{' '}
                        <span className="font-semibold capitalize">{entry.new_status}</span>
                      </p>
                      {entry.note && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{entry.note}</p>
                      )}
                      <p className="mt-0.5 text-xs text-muted-foreground opacity-60">{timeAgo(entry.created_at)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 6. Convert to Tenant */}
            {lead.status !== 'converted' && (
              <div className="pt-2">
                <Link
                  href={`/superadmin/tenants/new?lead_id=${lead.id}&name=${encodeURIComponent(lead.name)}&email=${encodeURIComponent(lead.email)}`}
                  className="inline-flex w-full items-center justify-center rounded-md border border-green-600 bg-transparent px-4 py-2 text-sm font-medium text-green-600 transition-colors hover:bg-green-50"
                >
                  Convert to Tenant
                </Link>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/superadmin/leads/components/lead-detail-panel.tsx
git commit -m "feat(leads): migrate detail panel to semantic theme tokens"
```

---

### Task 7: Wire up page with pipeline component and pass `statusBreakdown`

**Files:**
- Modify: `src/app/superadmin/leads/page.tsx`

- [ ] **Step 1: Replace the entire page file**

Replace the full contents of `src/app/superadmin/leads/page.tsx`:

```tsx
import { Suspense } from 'react'
import { getLeadStats } from '@/lib/leads/leads-analytics'
import { getLeads } from '@/lib/leads/leads-service'
import { LeadAnalytics } from './components/lead-analytics'
import { LeadStatusPipeline } from './components/lead-status-pipeline'
import { LeadsTable } from './components/leads-table'

export default async function LeadsPage() {
  const [stats, leadsResult] = await Promise.all([
    getLeadStats(),
    getLeads({ page: 1, pageSize: 20 }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Leads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage growth call bookings and track conversions
        </p>
      </div>

      <LeadAnalytics stats={stats} />

      <LeadStatusPipeline statusBreakdown={stats.statusBreakdown} />

      <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-muted" />}>
        <LeadsTable
          initialLeads={leadsResult.data ?? []}
          initialCount={leadsResult.count ?? 0}
          statusBreakdown={stats.statusBreakdown}
        />
      </Suspense>
    </div>
  )
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/superadmin/leads/page.tsx
git commit -m "feat(leads): wire up pipeline component and pass statusBreakdown to table"
```

---

### Task 8: Update loading skeleton

**Files:**
- Modify: `src/app/superadmin/leads/loading.tsx`

- [ ] **Step 1: Replace the entire loading file**

Replace the full contents of `src/app/superadmin/leads/loading.tsx`:

```tsx
import { Card, CardContent } from '@/components/ui/card'

export default function LeadsLoading() {
  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-muted" />
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
              </div>
              <div className="mt-3 h-8 w-16 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-3 w-20 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pipeline bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
          <div className="mt-4 flex gap-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-muted" />
                <div className="h-3 w-16 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Table card */}
      <Card className="overflow-hidden">
        <div className="border-b p-4">
          <div className="h-8 w-96 animate-pulse rounded bg-muted" />
        </div>
        <div className="p-4 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 w-full animate-pulse rounded bg-muted" />
          ))}
        </div>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/superadmin/leads/loading.tsx
git commit -m "feat(leads): update loading skeleton to match new layout"
```

---

### Task 9: Final lint check and visual verification

- [ ] **Step 1: Run linter**

Run: `npm run lint 2>&1 | tail -20`
Expected: No new errors. Fix any lint issues before proceeding.

- [ ] **Step 2: Run dev server and visually verify**

Run: `npm run dev`

Open `http://localhost:3000/superadmin/leads` and verify:
- Stat cards show icon badges with pastel backgrounds
- Pipeline bar renders between stat cards and table
- Table is wrapped in a card with semantic-colored avatars, dot badges, chevron icons
- Filter tabs show counts and use primary color for active state
- Detail panel sheet uses semantic tokens (no dark zinc colors)
- Loading skeleton matches the new layout when hard-refreshing

- [ ] **Step 3: Final commit if any lint fixes were needed**

```bash
git add -A
git commit -m "fix(leads): lint fixes for dashboard UI upgrade"
```
