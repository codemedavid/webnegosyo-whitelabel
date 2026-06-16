import '@testing-library/jest-dom'
// Augments `@jest/expect` so jest-dom matchers (toBeInTheDocument, toHaveClass, …)
// are typed for tests that import `expect` from `@jest/globals`.
import '@testing-library/jest-dom/jest-globals'

declare global {
  var mockRedis: jest.Mocked<{
    get: jest.Mock
    set: jest.Mock
    keys: jest.Mock
    del: jest.Mock
  }>
}
