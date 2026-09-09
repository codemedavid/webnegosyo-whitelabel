#!/usr/bin/env node
/**
 * One-off: send a published "What's New" announcement to every eligible
 * merchant device, through the same code path the superadmin composer uses.
 *
 *   ts-node -P scripts/tsconfig.json -r ./scripts/register-paths.js \
 *     scripts/send-announcement-push.ts <announcementId> [--execute]
 *
 * Dry run by default: prints the recipient count and sends nothing.
 */
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { countAnnouncementRecipients, sendAnnouncementPush } from '@/lib/push/send-announcement'

async function main() {
  const id = process.argv[2]
  const execute = process.argv.includes('--execute')
  if (!id) throw new Error('Usage: send-announcement-push.ts <announcementId> [--execute]')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')

  const client = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: row, error } = await client
    .from('platform_announcements')
    .select('title, status, audience_tenant_ids, push_sent_at')
    .eq('id', id)
    .single()
  if (error) throw new Error(error.message)

  const recipients = await countAnnouncementRecipients(client, row.audience_tenant_ids)
  console.log(`Announcement: ${row.title}`)
  console.log(`Status: ${row.status}  Already pushed: ${row.push_sent_at ?? 'no'}`)
  console.log(`Eligible devices: ${recipients}`)

  if (!execute) {
    console.log('\nDry run — pass --execute to actually send.')
    return
  }

  const result = await sendAnnouncementPush(client, id)
  console.log('\nSent:', JSON.stringify(result, null, 2))
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err)
  process.exit(1)
})
