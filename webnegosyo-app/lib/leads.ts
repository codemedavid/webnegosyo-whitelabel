// Sales lead pipeline logic for the platform console. `leads` is a
// platform-level table (no tenant_id) holding pre-tenant demo bookings.
//
// Status keys are pinned to the database CHECK constraint in
// supabase/migrations/20260326000001_leads_tables.sql; the test asserts the
// list matches, so a schema change breaks the build rather than the screen.

export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "converted"
  | "lost";

export interface LeadStatusMeta {
  key: LeadStatus;
  label: string;
}

export const LEAD_STATUSES: readonly LeadStatusMeta[] = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "converted", label: "Converted" },
  { key: "lost", label: "Lost" },
] as const;

/** Forward move for each open status; terminal statuses have none. */
const FORWARD_STATUS: Partial<Record<LeadStatus, LeadStatus>> = {
  new: "contacted",
  contacted: "qualified",
  qualified: "converted",
};

const TERMINAL_STATUSES: readonly LeadStatus[] = ["converted", "lost"];

export interface LeadRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  booking_date: string | null;
  booking_time: string | null;
  status: string;
  source: string | null;
  converted_tenant_id: string | null;
  created_at: string | null;
}

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.includes(status as LeadStatus);
}

/**
 * Statuses a lead may move to. A converted or lost lead is done — reopening it
 * would corrupt the funnel counts, so the UI offers nothing.
 */
export function allowedNextStatuses(status: string): LeadStatus[] {
  if (isTerminalStatus(status)) return [];
  const forward = FORWARD_STATUS[status as LeadStatus];
  return forward ? [forward, "lost"] : [];
}

export interface LeadFilters {
  query: string;
  status?: LeadStatus;
}

export function filterLeads(
  leads: readonly LeadRow[],
  filters: LeadFilters
): LeadRow[] {
  const needle = filters.query.trim().toLowerCase();
  return leads.filter((lead) => {
    const matchesQuery =
      needle === "" ||
      lead.name.toLowerCase().includes(needle) ||
      lead.email.toLowerCase().includes(needle) ||
      lead.phone.toLowerCase().includes(needle);
    return matchesQuery && (!filters.status || lead.status === filters.status);
  });
}

export interface LeadSummary {
  total: number;
  new: number;
  contacted: number;
  qualified: number;
  converted: number;
  lost: number;
  /** Leads still in play — neither converted nor lost. */
  open: number;
}

export function summarizeLeads(leads: readonly LeadRow[]): LeadSummary {
  const count = (status: LeadStatus) =>
    leads.filter((l) => l.status === status).length;

  return {
    total: leads.length,
    new: count("new"),
    contacted: count("contacted"),
    qualified: count("qualified"),
    converted: count("converted"),
    lost: count("lost"),
    open: leads.filter((l) => !isTerminalStatus(l.status)).length,
  };
}

/** Booking slot label. Postgres `time` arrives as HH:MM:SS. */
export function formatBookingSlot(
  date: string | null,
  time: string | null
): string {
  if (!date) return "—";
  if (!time) return date;
  const [hours, minutes] = time.split(":");
  return `${date} · ${hours}:${minutes}`;
}
