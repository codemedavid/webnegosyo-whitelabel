/**
 * Jest config for pure-logic modules (lib/, theme/).
 * Component/UI tests are out of scope here — screens are exercised manually
 * via Expo; data shaping and design tokens are covered by these unit tests.
 */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/lib", "<rootDir>/theme"],
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
