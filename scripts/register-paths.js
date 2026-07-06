// Register the `@/*` -> src/* path alias for ts-node scripts.
//
// tsconfig-paths' own `-r tsconfig-paths/register` reads the `-P` flag off
// process.argv, but ts-node strips its flags before the require runs, so it
// falls back to the root tsconfig (no baseUrl) and skips itself. Registering
// with explicit params here is deterministic and independent of arg parsing.
const path = require('path')

require('tsconfig-paths').register({
  baseUrl: path.join(__dirname, '..'),
  paths: { '@/*': ['src/*'] },
})
