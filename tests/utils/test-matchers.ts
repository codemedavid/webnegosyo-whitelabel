/**
 * Test matchers and utilities for Jest tests
 */

import { expect } from '@jest/globals'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toBeValidUrl(): R
      toBeHexString(): R
      toBeCurrency(): R
    }
  }
}

expect.extend({
  toBeValidUrl(received: string) {
    try {
      new URL(received)
      return {
        pass: true,
        message: () => `expected ${received} not to be a valid URL`,
      }
    } catch {
      return {
        pass: false,
        message: () => `expected ${received} to be a valid URL`,
      }
    }
  },

  toBeHexString(received: string) {
    const isValid = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(received)
    return {
      pass: isValid,
      message: () => `expected ${received} to be a valid hex color string`,
    }
  },

  toBeCurrency(received: string) {
    const pattern = /^[₱$€£¥]\s?\d{1,3}(,\d{3})*(\.\d{1,2})?$/
    return {
      pass: pattern.test(received),
      message: () => `expected ${received} to be a valid currency string`,
    }
  },
})
