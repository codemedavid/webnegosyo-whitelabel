// CommonJS mirror of jest.config.ts.
// Node 22 loads the .ts config as native ESM, where `next/jest` fails to resolve
// (no ESM export map entry). Loading via CJS `require` resolves next/jest.js.
// Run with: npx jest --config jest.config.cjs
const nextJest = require('next/jest')

const createJestConfig = nextJest({ dir: './' })

const config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  // The merchant app is a separate Expo project with its own runner
  // (webnegosyo-app/jest.config.js: ts-jest, node environment, React Native
  // mocks). Its tests were being swept in here and executed under this app's
  // jsdom/next config, where several cannot resolve their native and
  // expo-constants mocks. They are not skipped — `npm test` inside
  // webnegosyo-app runs all of them.
  // `sms/` is the standalone Expo SMS reference app, excluded for the same
  // reason and missed when it landed: its React Native sources cannot be parsed
  // by this app's next/jest transform, so its five suites failed on every run.
  // Five permanently-red suites train everyone to read "5 failed" as normal,
  // which is how a real regression gets waved through.
  // `e2e/` is Playwright's, not Jest's — its specs import @playwright/test and
  // drive a real browser, so Jest picking them up only ever produces failures.
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/webnegosyo-app/',
    '<rootDir>/sms/',
    '<rootDir>/e2e/',
  ],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
    '!src/**/__tests__/**',
  ],
}

module.exports = createJestConfig(config)
