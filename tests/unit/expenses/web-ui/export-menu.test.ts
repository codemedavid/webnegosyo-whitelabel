/**
 * Export downloads: a refusal (403, 413 …) is a toast with the server's
 * sentence, never a file holding that sentence; an object URL lives long
 * enough for the browser to start the download.
 */

import { downloadExport, downloadSelectionCsv } from '@/components/admin/expenses/export-menu'

const toastError = jest.fn()
jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(), { success: jest.fn(), error: (...args: unknown[]) => toastError(...args) }) }))

const createObjectURL = jest.fn(() => 'blob:export')
const revokeObjectURL = jest.fn()
const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

beforeEach(() => {
  jest.useFakeTimers()
  toastError.mockReset()
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
  click.mockClear()
  Object.assign(URL, { createObjectURL, revokeObjectURL })
})
afterEach(() => jest.useRealTimers())

/** A fetch Response stand-in (jsdom has no Response). */
function respond(status: number, body: string, headers: Record<string, string> = {}) {
  const lower = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))
  global.fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => lower.get(name.toLowerCase()) ?? null },
    text: async () => body,
    blob: async () => new Blob([body]),
  })) as unknown as typeof fetch
}

describe('downloadExport', () => {
  it('shows a refusal as a toast and downloads nothing', async () => {
    respond(413, 'This period has too many expenses for one file. Download a shorter period, such as one month.')

    await downloadExport('/api/expenses/export?format=csv', 'expenses.csv')

    expect(toastError).toHaveBeenCalledWith('This period has too many expenses for one file. Download a shorter period, such as one month.')
    expect(click).not.toHaveBeenCalled()
  })

  it('downloads the file under the server’s name and frees the link a little later', async () => {
    respond(200, 'a,b', { 'Content-Disposition': 'attachment; filename="expenses-sukad-2026-10.csv"' })

    await downloadExport('/api/expenses/export?format=csv', 'expenses.csv')

    expect(click).toHaveBeenCalledTimes(1)
    expect(toastError).not.toHaveBeenCalled()
    expect(revokeObjectURL).not.toHaveBeenCalled()
    jest.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:export')
  })
})

describe('downloadSelectionCsv', () => {
  it('keeps the object URL alive until the download has started', () => {
    downloadSelectionCsv({ expenses: [], categories: [], suppliers: [], outlets: [], fileName: 'selected.csv' })

    expect(click).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).not.toHaveBeenCalled()
    jest.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:export')
  })
})
