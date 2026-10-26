// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config')
const expoConfig = require('eslint-config-expo/flat')

module.exports = defineConfig([
  expoConfig,
  {
    // The contract + its fixtures are byte-identical copies of the web's (parity test); lint them there.
    ignores: ['dist/*', 'node_modules/*', 'src/lib/contract/*', 'src/fixtures/contract-fixtures.ts'],
  },
])
