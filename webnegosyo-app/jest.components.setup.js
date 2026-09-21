/**
 * Setup for the rendered-component suite.
 *
 * Deliberately almost empty. RNTL v13 extends `expect` with its own matchers
 * the moment it is imported, so the only thing left to declare is the act
 * environment. Nothing that decides money is stubbed here — see the sheets'
 * tests for why.
 */

// Without it every state update logs an act() warning loud enough to hide a
// real one.
global.IS_REACT_ACT_ENVIRONMENT = true;

// A jest.mock factory must not be hoisted above the module it stands in
// for, so the stand-in is reached with require() rather than an import;
// same for reading the mock back inside afterEach.
/* eslint-disable @typescript-eslint/no-require-imports */
// The shared resource hook keeps an offline copy of the register's reads on
// disk (lib/offline/resource-snapshot.ts), so every rendered hook now reaches
// AsyncStorage, whose native half is absent under Jest. The library's own
// in-memory mock is the documented stand-in; it decides nothing about money.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// The mock is one in-memory map per test FILE, and a snapshot written by one
// test would answer the next test's deliberately failing read. Each test
// starts with an empty device.
afterEach(async () => {
  const mocked = require("@react-native-async-storage/async-storage");
  const api = mocked.default ?? mocked;
  // A suite that mocks the module itself may offer no `clear`; that mock is
  // its own to reset.
  if (typeof api.clear === "function") await api.clear();
});
