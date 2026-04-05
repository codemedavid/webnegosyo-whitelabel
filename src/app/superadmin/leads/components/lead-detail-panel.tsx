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
