/**
 * Test helpers and utilities
 */

import { createMockSupabaseClient } from '../mocks/supabase'

/**
 * Create a mock environment for testing
 */
export function createMockEnvironment() {
  const mockSupabase = createMockSupabaseClient()

  return {
    supabase: mockSupabase,
  }
}

/**
 * Set up a mock response sequence for a query builder
 */
export function setupMockResponseSequence(
  mockFn: jest.Mock,
  responses: Array<{ data: unknown; error: unknown }>
) {
  responses.forEach((response) => {
    mockFn.mockImplementationOnce(() => Promise.resolve(response))
  })
}

/**
 * Wait for async operations to complete
 */
export async function flushPromises() {
  return new Promise(resolve => setImmediate(resolve))
}

/**
 * Mock console methods to reduce noise in tests
 */
export function mockConsole() {
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
  const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {})
  const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {})

  return {
    restore: () => {
      consoleError.mockRestore()
      consoleWarn.mockRestore()
      consoleLog.mockRestore()
    },
  }
}

/**
 * Get a random ID for testing
 */
export function getRandomId(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Create a delay for testing
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
