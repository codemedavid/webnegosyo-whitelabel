'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Mail, Phone, CalendarClock, ArrowUpRight, Loader2, MessageSquarePlus } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { fetchLeadDetail, changeLeadStatus, addLeadNote } from '@/app/actions/leads'
import { LEAD_STATUS_CONFIG } from './lead-status-badge'
import type { LeadStatus, Lead, LeadNote, LeadStatusHistoryEntry } from '@/lib/leads/types'

interface LeadDetailPanelProps {
  leadId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onStatusChange: () => void
}

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'converted', label: 'Converted' },
  { value: 'lost', label: 'Lost' },
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/45">{children}</div>
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
        className="flex w-full flex-col gap-0 overflow-y-auto rounded-l-2xl border-white/10 bg-background p-0 sm:max-w-md"
      >
        {isLoading || !lead ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-white/45">
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading lead...
                </>
              ) : (
                'No lead selected.'
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6 p-6">
            <SheetHeader className="p-0">
              <SheetTitle className="sr-only">{lead.name} — Lead Detail</SheetTitle>
            </SheetHeader>

            {/* 1. Header: Avatar + name + contact actions */}
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold ${avatarClass(lead.status)}`}
                >
                  {getInitials(lead.name)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-lg font-semibold text-white">{lead.name}</div>
                  <div className="mt-0.5 truncate text-xs capitalize text-white/45">
                    {lead.source.replace(/_/g, ' ')}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <a
                  href={`mailto:${lead.email}`}
                  className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white/80 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                >
                  <Mail className="h-4 w-4 shrink-0 text-white/45" />
                  <span className="truncate">{lead.email}</span>
                </a>
                {lead.phone && (
                  <a
                    href={`tel:${lead.phone}`}
                    className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white/80 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                  >
                    <Phone className="h-4 w-4 shrink-0 text-white/45" />
                    <span className="truncate">{lead.phone}</span>
                  </a>
                )}
              </div>
            </div>

            {/* 2. Status changer */}
            <div>
              <SectionLabel>Status</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((opt) => {
                  const isActive = lead.status === opt.value
                  const c = LEAD_STATUS_CONFIG[opt.value]
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={isChangingStatus}
                      aria-pressed={isActive}
                      onClick={() => handleStatusChange(opt.value)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        isActive
                          ? `${c.bg} ${c.text} ${c.border}`
                          : 'border-white/10 bg-white/[0.04] text-white/60 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${isActive ? c.dot : 'bg-white/30'}`} />
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 3. Booking info */}
            {lead.booking_date && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl border border-indigo-400/20 bg-indigo-400/10 p-2">
                    <CalendarClock className="h-4 w-4 text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
                      Scheduled call
                    </div>
                    <div className="mt-1 text-sm font-medium text-white">{formatDate(lead.booking_date)}</div>
                    {lead.booking_time && (
                      <div className="mt-0.5 text-sm text-white/55">{formatTime(lead.booking_time)}</div>
                    )}
                    <div className="mt-1.5 text-xs text-white/35">15-minute growth call</div>
                  </div>
                </div>
              </div>
            )}

            {/* 4. Notes */}
            <div>
              <SectionLabel>
                Notes{notes.length > 0 ? <span className="ml-1.5 text-white/30">{notes.length}</span> : null}
              </SectionLabel>
              {notes.length > 0 ? (
                <ul className="mb-4 space-y-2.5">
                  {notes.map((n) => (
                    <li key={n.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                      <p className="whitespace-pre-wrap text-sm text-white/80">{n.note}</p>
                      <p className="mt-1.5 text-xs text-white/40">{timeAgo(n.created_at)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-dashed border-white/10 bg-white/[0.01] px-3 py-4 text-sm text-white/40">
                  <MessageSquarePlus className="h-4 w-4" />
                  No notes yet — add the first one below.
                </div>
              )}
              <Textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note about this lead..."
                rows={3}
                aria-label="New note"
              />
              <Button
                size="sm"
                disabled={!noteText.trim() || isSavingNote}
                onClick={handleSaveNote}
                className="mt-2 gap-1.5"
              >
                {isSavingNote ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Note'
                )}
              </Button>
            </div>

            {/* 5. Status history */}
            {history.length > 0 && (
              <div>
                <SectionLabel>Status History</SectionLabel>
                <div className="space-y-4 border-l border-white/10 pl-4">
                  {history.map((entry) => {
                    const c = LEAD_STATUS_CONFIG[entry.new_status as LeadStatus]
                    return (
                      <div key={entry.id} className="relative">
                        <span
                          className={`absolute -left-[1.3125rem] top-1.5 h-2 w-2 rounded-full ring-2 ring-background ${
                            c ? c.dot : 'bg-white/40'
                          }`}
                          aria-hidden
                        />
                        <p className="text-sm text-white/80">
                          Moved to{' '}
                          <span className={`font-semibold capitalize ${c ? c.text : 'text-white'}`}>
                            {entry.new_status}
                          </span>
                        </p>
                        {entry.note && <p className="mt-0.5 text-xs text-white/55">{entry.note}</p>}
                        <p className="mt-0.5 text-xs text-white/35">{timeAgo(entry.created_at)}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 6. Convert to Tenant */}
            {lead.status !== 'converted' && (
              <div className="pt-1">
                <Link
                  href={`/superadmin/tenants/new?lead_id=${lead.id}&name=${encodeURIComponent(lead.name)}&email=${encodeURIComponent(lead.email)}`}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-medium text-emerald-400 transition-colors hover:bg-emerald-400/20"
                >
                  Convert to Tenant
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
