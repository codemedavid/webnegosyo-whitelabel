// Runs every tests/sql/run-*.cjs (except this file) one after another, each
// in its own Node process with the repo root as cwd (several runners read
// migrations by repo-relative path). Prints one line per runner, the full
// output of any that failed, and exits non-zero if any failed.
//   npm run test:sql
const { spawnSync } = require('node:child_process')
const { readdirSync } = require('node:fs')
const path = require('node:path')

const SQL_DIR = __dirname
const REPO_ROOT = path.resolve(SQL_DIR, '../..')
const SELF = path.basename(__filename)
const RUNNER_TIMEOUT_MS = 5 * 60 * 1000

function listRunners() {
  return readdirSync(SQL_DIR)
    .filter((name) => /^run-.+\.cjs$/.test(name) && name !== SELF)
    .sort()
}

function runOne(name) {
  const started = Date.now()
  const result = spawnSync(process.execPath, [path.join(SQL_DIR, name)], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: RUNNER_TIMEOUT_MS,
    env: process.env,
  })
  const ms = Date.now() - started
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  const timedOut = result.error?.code === 'ETIMEDOUT'
  const passed = !result.error && result.status === 0
  const reason = timedOut ? `timed out after ${RUNNER_TIMEOUT_MS} ms` : result.error ? result.error.message : `exit ${result.status ?? result.signal}`
  return { name, passed, ms, output, reason }
}

function main() {
  const runners = listRunners()
  const results = runners.map((name) => {
    const result = runOne(name)
    const status = result.passed ? 'PASS' : 'FAIL'
    console.log(`${status}  ${name.padEnd(42)} ${String(result.ms).padStart(6)} ms`)
    return result
  })
  const failed = results.filter((result) => !result.passed)
  for (const result of failed) {
    console.log(`\n--- ${result.name} (${result.reason}) ---\n${result.output || '(no output)'}`)
  }
  const totalMs = results.reduce((sum, result) => sum + result.ms, 0)
  console.log(`\n${results.length - failed.length}/${results.length} SQL runners passed in ${totalMs} ms`)
  if (failed.length > 0 || results.length === 0) process.exitCode = 1
}

main()
