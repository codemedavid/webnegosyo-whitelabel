/**
 * Jest config for pure-logic modules (lib/, theme/, plugins/) and the Zustand
 * stores in stores/.
 *
 * `stores/` was added because it is not presentation: the register's cart store
 * is where a sale's money actually lives, and four voucher defects reached main
 * through it while no test in either repo could even import the file. The
 * stores are plain Zustand — no React renderer needed — so they run under the
 * same `node` environment as lib/.
 *
 * Screens (app/, components/) remain out of scope and are exercised manually
 * via Expo; anything in them that decides money belongs in lib/ or stores/.
 */
module.exports = {
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
