/**
 * Two suites, run side by side.
 *
 * `logic` is the original one: pure modules (lib/, theme/, plugins/) plus the
 * Zustand stores. It runs under `node` with ts-jest, which type-checks as it
 * goes and is fast because nothing renders.
 *
 * `components` renders the actual React Native components. It exists because
 * the four voucher money defects that reached main did so through code this
 * config could not even import — and after the stores were covered, the
 * register's sheets were still the last place where a cashier-visible decision
 * about money was made with nothing able to observe it.
 *
 * They are separate PROJECTS rather than one config because they need
 * genuinely incompatible transforms. React Native ships untranspiled Flow
 * source, so it must go through babel-jest and the RN preset; ts-jest cannot
 * read it. A single config would have meant giving up type-checking on the
 * logic suite in order to render, or giving up rendering to keep it. Projects
 * let each keep what it needs, and `npx jest` still runs both.
 */

/** Pure logic and stores — unchanged from before components were testable. */
const logic = {
  displayName: "logic",
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/lib", "<rootDir>/theme", "<rootDir>/plugins", "<rootDir>/stores"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: { jsx: "react-jsx", esModuleInterop: true },
        // Transpile third-party source (the thermal printer library) without
        // type-checking it; our own lib/theme code is still fully checked.
        diagnostics: { exclude: ["**/node_modules/**"] },
      },
    ],
  },
  // The thermal printer library ships TypeScript source (src/index.tsx), so it
  // must be transformed rather than ignored. Everything else in node_modules
  // stays ignored.
  transformIgnorePatterns: [
    "/node_modules/(?!@haroldtran/react-native-thermal-printer/)",
  ],
};

/**
 * Rendered components. `.test.tsx` only, so the logic suite is not picked up a
 * second time and made to pay for a renderer it does not need.
 */
const components = {
  displayName: "components",
  preset: "react-native",
  roots: ["<rootDir>/components"],
  testMatch: ["**/*.test.tsx"],
  setupFilesAfterEnv: ["<rootDir>/jest.components.setup.js"],
  transformIgnorePatterns: [
    "/node_modules/(?!(react-native|@react-native|@react-native-community|expo|expo-modules-core|expo-.*|@expo|@testing-library)/)",
  ],
};

module.exports = { projects: [logic, components] };
