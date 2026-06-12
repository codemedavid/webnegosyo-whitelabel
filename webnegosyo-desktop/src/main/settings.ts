import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { AppSettings } from '../shared/types'

interface PersistedState {
  settings: AppSettings
  printedOrderIds: string[]
}

const DEFAULTS: PersistedState = {
  settings: {
    printerName: '',
    paperWidthMm: 80,
    autoPrintEnabled: true,
    receiptFooter: 'Thank you! Please come again.',
  },
  printedOrderIds: [],
}

const MAX_PRINTED_IDS = 1000

let cached: PersistedState | null = null

function filePath(): string {
  return join(app.getPath('userData'), 'pos-settings.json')
}

function load(): PersistedState {
  if (cached) return cached
  try {
    const raw = JSON.parse(readFileSync(filePath(), 'utf-8')) as Partial<PersistedState>
    cached = {
      settings: { ...DEFAULTS.settings, ...raw.settings },
      printedOrderIds: Array.isArray(raw.printedOrderIds) ? raw.printedOrderIds : [],
    }
  } catch {
    cached = { ...DEFAULTS, settings: { ...DEFAULTS.settings }, printedOrderIds: [] }
  }
  return cached
}

function save(): void {
  if (!cached) return
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(filePath(), JSON.stringify(cached, null, 2))
}

export function getSettings(): AppSettings {
  return load().settings
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const state = load()
  state.settings = { ...state.settings, ...patch }
  save()
  return state.settings
}

export function getPrintedOrderIds(): string[] {
  return load().printedOrderIds
}

export function hasPrinted(orderId: string): boolean {
  return load().printedOrderIds.includes(orderId)
}

export function markPrinted(orderId: string): void {
  const state = load()
  if (state.printedOrderIds.includes(orderId)) return
  state.printedOrderIds.push(orderId)
  if (state.printedOrderIds.length > MAX_PRINTED_IDS) {
    state.printedOrderIds = state.printedOrderIds.slice(-MAX_PRINTED_IDS)
  }
  save()
}
