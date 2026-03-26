export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost'

export interface Lead {
  id: string
  name: string
  email: string
  phone: string
  booking_date: string
  booking_time: string
  status: LeadStatus
  source: string
  converted_tenant_id: string | null
  created_at: string
  updated_at: string
}

export interface LeadNote {
  id: string
  lead_id: string
  note: string
  created_by: string | null
  created_at: string
}

export interface LeadStatusHistoryEntry {
  id: string
  lead_id: string
  old_status: string | null
  new_status: string
  changed_by: string | null
  note: string | null
  created_at: string
}

export interface LeadStats {
  totalLeads: number
  newThisWeek: number
  conversionRate: number
  conversionDelta: number
  pendingCalls: number
  pendingToday: number
  avgResponseTimeHours: number
}

export interface WeeklyLeadData {
  week: string
  count: number
}
