import { fitsOneReportCall, splitReportWindow } from '@/lib/reports/read/report-chunks'
import type { CutoffSchedule } from '@/lib/business-day/trading-day'

const manila = (wallClock: string): number => Date.parse(`${wallClock}+08:00`)
const NOW = manila('2026-10-14T14:00:00')

describe('splitReportWindow', () => {
  it('returns nothing for an empty window', () => {
    expect(splitReportWindow(NOW, NOW, { now: NOW })).toEqual([])
  })

  it('keeps a window one call can read as a single chunk', () => {
    const start = manila('2026-07-14T00:00:00')
    expect(fitsOneReportCall(start, NOW)).toBe(true)
    expect(splitReportWindow(start, NOW, { now: NOW })).toEqual([{ start, end: NOW, isClosed: false }])
  })

  it('marks a short window that ended before today as closed', () => {
    const start = manila('2026-09-01T00:00:00')
    const end = manila('2026-10-01T00:00:00')
    expect(splitReportWindow(start, end, { now: NOW })).toEqual([{ start, end, isClosed: true }])
  })

  it('splits a year at every month start, with only the running month open', () => {
    const start = manila('2025-11-01T00:00:00')
    const chunks = splitReportWindow(start, NOW, { now: NOW })
    expect(chunks).toHaveLength(12)
    expect(chunks[0]).toEqual({ start, end: manila('2025-12-01T00:00:00'), isClosed: true })
    expect(chunks[11]).toEqual({ start: manila('2026-10-01T00:00:00'), end: NOW, isClosed: false })
    expect(chunks.slice(0, 11).every((chunk) => chunk.isClosed)).toBe(true)
  })

  it('tiles the window with no gap and no overlap, starting mid-month', () => {
    const start = manila('2025-09-17T00:00:00')
    const chunks = splitReportWindow(start, NOW, { now: NOW })
    expect(chunks[0].start).toBe(start)
    expect(chunks[0].end).toBe(manila('2025-10-01T00:00:00'))
    expect(chunks[chunks.length - 1].end).toBe(NOW)
    chunks.slice(1).forEach((chunk, index) => expect(chunk.start).toBe(chunks[index].end))
    expect(chunks.every((chunk) => fitsOneReportCall(chunk.start, chunk.end))).toBe(true)
  })

  it('cuts months at the business-day start when the store closes after midnight', () => {
    const fourAm: CutoffSchedule = [{ effectiveFrom: '2025-01-01', cutoffMinutes: 240 }]
    const start = manila('2025-11-01T04:00:00')
    const chunks = splitReportWindow(start, NOW, { now: NOW, schedule: fourAm })
    expect(chunks[0].end).toBe(manila('2025-12-01T04:00:00'))
  })
})
