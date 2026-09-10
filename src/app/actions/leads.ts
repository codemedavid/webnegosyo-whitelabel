'use server'

import {
  getLeads,
  updateLeadStatus,
  addNote,
  getLeadById,
  getLeadNotes,
  getLeadHistory,
} from '@/lib/leads/leads-service'
import type { LeadStatus } from '@/lib/leads/types'
import { verifySuperadmin } from '@/lib/admin-service'

// The lead pipeline is prospective merchants' PII, read through the
// service-role client. Every entry point is superadmin-only.

export async function fetchLeads(options: {
  status?: LeadStatus
  search?: string
  page?: number
}) {
  await verifySuperadmin()
  return getLeads(options)
}

export async function fetchLeadDetail(id: string) {
  await verifySuperadmin()
  const [lead, notes, history] = await Promise.all([
    getLeadById(id),
    getLeadNotes(id),
    getLeadHistory(id),
  ])
  return { lead: lead.data, notes, history }
}

export async function changeLeadStatus(
  leadId: string,
  oldStatus: string,
  newStatus: LeadStatus,
  userId?: string
) {
  await verifySuperadmin()
  return updateLeadStatus(leadId, oldStatus as LeadStatus, newStatus, userId)
}

export async function addLeadNote(leadId: string, note: string, userId?: string) {
  await verifySuperadmin()
  return addNote(leadId, note, userId)
}
