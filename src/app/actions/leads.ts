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

export async function fetchLeads(options: {
  status?: LeadStatus
  search?: string
  page?: number
}) {
  return getLeads(options)
}

export async function fetchLeadDetail(id: string) {
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
  return updateLeadStatus(leadId, oldStatus as LeadStatus, newStatus, userId)
}

export async function addLeadNote(leadId: string, note: string, userId?: string) {
  return addNote(leadId, note, userId)
}
