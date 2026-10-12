import { parseCsv } from '@/lib/inventory/import/csv'
import { resolveReportPeriod } from '@/lib/gov-discount-reports/period'
import {
  bookFileName,
  bookTitle,
  buildDailySummaryCsv,
  buildExportCsv,
  buildSalesBookCsv,
  isExportBook,
  kindsWithLines,
  salesBookHeaders,
  SUMMARY_HEADERS,
} from '@/lib/gov-discount-reports/sales-book'
import { claim, reversalOf } from '../../fixtures/gov-discount-claims'

const NOW = Date.parse('2026-10-12T02:00:00.000Z')

function rowsOf(csv: string): string[][] {
  return parseCsv(csv.replace(/^﻿/, ''))
}

describe('salesBookHeaders', () => {
  it('uses the BIR columns, named for Senior Citizens', () => {
    expect(salesBookHeaders('senior')).toEqual([
      'Date',
      'Name of Senior Citizen',
      'OSCA ID No.',
      'Invoice/Order No.',
      'Gross Sales (VAT-inclusive)',
      'VAT Exempted',
      'VAT-Exempt Sales',
      'Discount (20%)',
      'Net Amount',
      'Cashier',
      'Approved by',
      'Remarks',
    ])
  })

  it('names the PWD columns and the athlete VAT columns for what they are', () => {
    expect(salesBookHeaders('pwd').slice(1, 3)).toEqual(['Name of PWD', 'PWD ID No.'])
    expect(salesBookHeaders('athlete').slice(5, 7)).toEqual(['VAT Reduction', 'VAT-Exclusive Sales'])
  })
})

describe('buildSalesBookCsv', () => {
  const grant = claim({
    kind: 'senior',
    claimantName: 'Lola Remedios',
    idNumber: 'OSCA-0001234',
    orderLabel: '#12',
    occurredAt: '2026-10-04T17:30:00.000Z', // 5 Oct, 01:30 in Manila
    approvedByName: 'Manager Ben',
  })
  const cancelled = claim({ kind: 'senior', orderLabel: '#13', occurredAt: '2026-10-05T02:00:00.000Z' })
  const reversal = reversalOf(cancelled, { grantedByName: 'Manager Ben', occurredAt: '2026-10-06T02:00:00.000Z' })
  const pwd = claim({ kind: 'pwd' })

  it('prints only the kind asked for, oldest first, with FULL ID numbers and Manila dates', () => {
    const rows = rowsOf(buildSalesBookCsv('senior', [reversal, pwd, cancelled, grant]))
    expect(rows[0][1]).toBe('Name of Senior Citizen')
    expect(rows[1]).toEqual([
      '2026-10-05',
      'Lola Remedios',
      'OSCA-0001234',
      '#12',
      '112.00',
      '12.00',
      '100.00',
      '20.00',
      '80.00',
      'Ana',
      'Manager Ben',
      '',
    ])
    expect(rows).toHaveLength(5) // header + 3 lines + TOTAL
  })

  it('prints a reversal as a negative line on the day it was recorded, with a remark', () => {
    const rows = rowsOf(buildSalesBookCsv('senior', [grant, cancelled, reversal]))
    const reversalLine = rows[3]
    expect(reversalLine[0]).toBe('2026-10-06')
    expect(reversalLine.slice(4, 9)).toEqual(['-112.00', '-12.00', '-100.00', '-20.00', '-80.00'])
    expect(reversalLine[9]).toBe('Manager Ben')
    expect(reversalLine[11]).toMatch(/Reversal/)
  })

  it('ends with a TOTAL line that is already net of reversals', () => {
    const rows = rowsOf(buildSalesBookCsv('senior', [grant, cancelled, reversal]))
    const total = rows[rows.length - 1]
    expect(total[0]).toBe('TOTAL')
    expect(total[1]).toBe('1 net sales')
    expect(total.slice(4, 9)).toEqual(['112.00', '12.00', '100.00', '20.00', '80.00'])
  })

  it('notes a shared table in the remarks', () => {
    const shared = claim({ allocationMode: 'shared', diners: 4 })
    expect(rowsOf(buildSalesBookCsv('senior', [shared]))[1][11]).toBe('Shared table of 4')
  })

  it('defuses a claimant name typed as a formula', () => {
    const hostile = claim({ claimantName: '=HYPERLINK("http://evil","x")' })
    expect(rowsOf(buildSalesBookCsv('senior', [hostile]))[1][1].startsWith("'=")).toBe(true)
  })

  it('still writes headers and a zero TOTAL for an empty period', () => {
    const rows = rowsOf(buildSalesBookCsv('pwd', []))
    expect(rows).toHaveLength(2)
    expect(rows[1].slice(4, 9)).toEqual(['0.00', '0.00', '0.00', '0.00', '0.00'])
  })
})

describe('buildDailySummaryCsv', () => {
  it('adds up each Manila day per type, then totals per type and overall', () => {
    const dayOneSenior = claim({ kind: 'senior', occurredAt: '2026-10-01T03:00:00.000Z' })
    const dayOneSeniorLate = claim({ kind: 'senior', occurredAt: '2026-10-01T15:30:00.000Z' }) // 23:30 Manila
    const dayOnePwd = claim({ kind: 'pwd', occurredAt: '2026-10-01T04:00:00.000Z' })
    const dayTwoAfterMidnight = claim({ kind: 'senior', occurredAt: '2026-10-01T16:30:00.000Z' }) // 2 Oct 00:30
    const reversal = reversalOf(dayOneSenior, { occurredAt: '2026-10-02T05:00:00.000Z' })

    const rows = rowsOf(buildDailySummaryCsv([reversal, dayTwoAfterMidnight, dayOnePwd, dayOneSeniorLate, dayOneSenior]))
    expect(rows[0]).toEqual([...SUMMARY_HEADERS])
    expect(rows.slice(1).map((row) => [row[0], row[1], row[2], row[8]])).toEqual([
      ['2026-10-01', 'SC', '2', '64.00'],
      ['2026-10-01', 'PWD', '1', '32.00'],
      ['2026-10-02', 'SC', '0', '0.00'],
      ['TOTAL', 'SC', '2', '64.00'],
      ['TOTAL', 'PWD', '1', '32.00'],
      ['TOTAL', 'ALL', '3', '96.00'],
    ])
  })

  it('is just headers and a zero grand total for an empty period', () => {
    const rows = rowsOf(buildDailySummaryCsv([]))
    expect(rows).toHaveLength(2)
    expect(rows[1].slice(0, 3)).toEqual(['TOTAL', 'ALL', '0'])
  })
})

describe('export helpers', () => {
  it('names files by book and period', () => {
    const october = resolveReportPeriod({ period: 'month' }, NOW)
    expect(bookFileName('senior', october)).toBe('senior-citizen-sales-book_2026-10.csv')
    expect(bookFileName('pwd', october)).toBe('pwd-sales-book_2026-10.csv')
    expect(bookFileName('summary', october)).toBe('senior-pwd-daily-summary_2026-10.csv')
    const custom = resolveReportPeriod({ period: 'custom', from: '2026-10-01', to: '2026-10-07' }, NOW)
    expect(bookFileName('athlete', custom)).toBe('national-athlete-sales-book_2026-10-01_to_2026-10-07.csv')
  })

  it('accepts only known books', () => {
    expect(isExportBook('senior')).toBe(true)
    expect(isExportBook('summary')).toBe(true)
    expect(isExportBook('solo_parent')).toBe(false)
    expect(isExportBook(null)).toBe(false)
  })

  it('titles each book', () => {
    expect(bookTitle('senior')).toBe('Senior Citizen sales book')
    expect(bookTitle('summary')).toBe('Daily summary')
  })

  it('lists the kinds present in register order', () => {
    expect(kindsWithLines([claim({ kind: 'medal_of_valor' }), claim({ kind: 'senior' })])).toEqual([
      'senior',
      'medal_of_valor',
    ])
  })

  it('dispatches each book', () => {
    const rows = [claim({ kind: 'pwd' })]
    expect(buildExportCsv('pwd', rows)).toBe(buildSalesBookCsv('pwd', rows))
    expect(buildExportCsv('summary', rows)).toBe(buildDailySummaryCsv(rows))
  })
})
