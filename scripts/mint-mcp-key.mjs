#!/usr/bin/env node
/**
 * Mint a SmartMenu MCP API key.
 *
 * Generates a superadmin Bearer key for the remote MCP server, stores ONLY its
 * SHA-256 hash in `mcp_api_keys`, and prints the plaintext exactly once. Hashing
 * mirrors src/lib/mcp-auth.ts (the source of truth) — keep them in sync.
 *
 * Run: node scripts/mint-mcp-key.mjs "Label for this key"
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL (loads .env.local).
 */

import { createHash, randomBytes } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

// --- Load .env.local (mimics Next.js) so the script works without exported env.
const envLocalPath = resolve(process.cwd(), '.env.local')
if (existsSync(envLocalPath)) {
  for (const line of readFileSync(envLocalPath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}

// Constants — MUST match src/lib/mcp-auth.ts.
const MCP_KEY_PREFIX = 'smk_live_'
const KEY_RANDOM_BYTES = 24
const hashApiKey = (plaintext) => createHash('sha256').update(plaintext).digest('hex')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env.local)')
  process.exit(1)
}

const label = process.argv[2]?.trim() || 'smartmenu-mcp key'

const plaintext = `${MCP_KEY_PREFIX}${randomBytes(KEY_RANDOM_BYTES).toString('hex')}`
const keyHash = hashApiKey(plaintext)

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data, error } = await supabase
  .from('mcp_api_keys')
  .insert({ key_hash: keyHash, key_prefix: MCP_KEY_PREFIX, label, scopes: ['superadmin'] })
  .select('id, label, created_at')
  .single()

if (error) {
  console.error('❌ Failed to insert key:', error.message)
  process.exit(1)
}

console.log('\n✅ MCP API key minted (store it now — it will NOT be shown again):\n')
console.log(`   ${plaintext}\n`)
console.log(`   id:    ${data.id}`)
console.log(`   label: ${data.label}`)
console.log(`   created: ${data.created_at}\n`)
console.log('Use it as the Bearer token when connecting Claude/ChatGPT to /api/mcp/mcp.')
console.log('Revoke later with: UPDATE mcp_api_keys SET revoked_at = now() WHERE id = \'' + data.id + '\';\n')
