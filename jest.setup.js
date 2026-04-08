import '@testing-library/jest-dom'

// Polyfill structuredClone for jsdom environment (available in Node 17+ but not always exposed by jsdom)
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = (obj) => JSON.parse(JSON.stringify(obj))
}

let uuidCounter = 0

// `uuid@13` resolves to an ESM entrypoint that Jest does not transpile in this setup.
// Mock it with deterministic RFC4122-shaped IDs so schema tests still exercise UUID validation.
jest.mock('uuid', () => ({
  v4: jest.fn(() => {
    uuidCounter += 1
    return `00000000-0000-4000-8000-${uuidCounter.toString(16).padStart(12, '0')}`
  }),
}))

beforeEach(() => {
  uuidCounter = 0
})

// Mock Supabase SSR to prevent actual HTTP requests
const mockFrom = jest.fn()
const mockAuth = {
  getUser: jest.fn(),
}

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(() => ({
    from: mockFrom,
    auth: mockAuth,
  })),
}))

// Mock Next.js cookies() API
const mockCookies = () => ({
  get: jest.fn().mockReturnValue({ value: 'test-value' }),
  set: jest.fn(),
  delete: jest.fn(),
  getAll: jest.fn().mockReturnValue([]),
})

jest.mock('next/headers', () => ({
  cookies: mockCookies,
  headers: jest.fn().mockReturnValue(new Headers()),
}))

// Mock Next.js revalidatePath
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}))

// Mock Upstash Redis for testing
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  keys: jest.fn(),
  del: jest.fn(),
}

jest.mock('@upstash/redis', () => ({
  Redis: jest.fn(() => mockRedis),
}))

// Export for use in tests
global.mockRedis = mockRedis

// Suppress console warnings during tests
const originalWarn = console.warn
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('cookies')) {
    return
  }
  originalWarn(...args)
}

// Export for use in tests
global.mockFrom = mockFrom
