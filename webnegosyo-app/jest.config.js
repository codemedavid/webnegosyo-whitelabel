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
      { tsconfig: { jsx: "react-jsx", esModuleInterop: true } },
    ],
  },
};
