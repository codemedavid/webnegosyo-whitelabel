import '@testing-library/jest-dom'

declare global {
  var mockRedis: jest.Mocked<{
    get: jest.Mock
    set: jest.Mock
    keys: jest.Mock
    del: jest.Mock
  }>
}
