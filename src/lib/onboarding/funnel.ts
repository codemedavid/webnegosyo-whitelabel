/**
 * The onboarding funnel, from each set-up's first-time events: how many
 * reached each stage, where they stall, and how long to the first order.
 * Pure; the reads live in `funnel-data.ts`.
 */

export interface FunnelSetup {
  id: string
  businessName: string
  createdAt: string
  /** event name → when it first happened (ISO). */
  events: ReadonlyMap<string, string>
  /** The store's first order since it opened (ISO), when there is one. */
  firstOrderAt: string | null
}

export interface FunnelStageDef {
  id: string
  label: string
  /** Reached when any of these events happened (or the predicate holds). */
  reached: (setup: FunnelSetup) => boolean
}

const has = (...events: string[]) => (setup: FunnelSetup) => events.some((event) => setup.events.has(event))

/** In funnel order. A later stage implies the earlier ones for anyone who got there by an older wizard. */
export const FUNNEL_STAGES: readonly FunnelStageDef[] = [
  { id: 'opened', label: 'Opened the link', reached: has('opened', 'screen:goals', 'submitted') },
  { id: 'goals', label: 'Picked their goals', reached: has('screen:channels', 'submitted') },
  { id: 'store', label: 'Started their store', reached: has('screen:store', 'submitted') },
  { id: 'menu', label: 'Added their menu', reached: has('screen:ordering', 'submitted') },
  { id: 'submitted', label: 'Built their store', reached: has('submitted') },
  { id: 'live', label: 'Store opened', reached: has('live') },
  { id: 'shared', label: 'Shared their link', reached: has('shared') },
  { id: 'choices', label: 'Finished quick choices', reached: has('choices_done') },
  { id: 'first_order', label: 'First real order', reached: (setup) => setup.firstOrderAt !== null },
]

export interface FunnelStageCount {
  id: string
  label: string
  count: number
  /** Share of everyone who opened the link; null when nobody did. */
  share: number | null
}

export interface StalledSetup {
  id: string
  businessName: string
  /** The last stage they reached. */
  stage: string
  /** Days since their latest event. */
  quietDays: number
}

export interface FunnelReport {
  stages: FunnelStageCount[]
  /** Median hours from "store opened" to the first order; null with no data. */
  medianHoursToFirstOrder: number | null
  stalled: StalledSetup[]
}

const MS_PER_HOUR = 60 * 60 * 1000
const MS_PER_DAY = 24 * MS_PER_HOUR
/** Quiet for this long before the store opened: worth a call. */
export const STALLED_AFTER_DAYS = 1

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function lastStageOf(setup: FunnelSetup): string {
  const reached = FUNNEL_STAGES.filter((stage) => stage.reached(setup))
  return reached.length > 0 ? reached[reached.length - 1].label : 'Not opened yet'
}

function latestEventMs(setup: FunnelSetup): number {
  const times = [...setup.events.values(), setup.createdAt].map((iso) => Date.parse(iso)).filter(Number.isFinite)
  return Math.max(...times)
}

export function buildFunnelReport(setups: readonly FunnelSetup[], nowMs: number): FunnelReport {
  const opened = setups.filter(FUNNEL_STAGES[0].reached).length
  const stages = FUNNEL_STAGES.map((stage) => {
    const count = setups.filter(stage.reached).length
    return { id: stage.id, label: stage.label, count, share: opened > 0 ? count / opened : null }
  })

  const hoursToFirstOrder = setups.flatMap((setup) => {
    const live = setup.events.get('live')
    if (!live || !setup.firstOrderAt) return []
    const hours = (Date.parse(setup.firstOrderAt) - Date.parse(live)) / MS_PER_HOUR
    return Number.isFinite(hours) && hours >= 0 ? [hours] : []
  })

  const stalled = setups
    .filter((setup) => !setup.events.has('live'))
    .map((setup) => ({ setup, quietDays: (nowMs - latestEventMs(setup)) / MS_PER_DAY }))
    .filter(({ quietDays }) => quietDays >= STALLED_AFTER_DAYS)
    .sort((a, b) => a.quietDays - b.quietDays)
    .map(({ setup, quietDays }) => ({ id: setup.id, businessName: setup.businessName, stage: lastStageOf(setup), quietDays: Math.floor(quietDays) }))

  return { stages, medianHoursToFirstOrder: median(hoursToFirstOrder), stalled }
}
