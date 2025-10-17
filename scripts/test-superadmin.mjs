// Usage:
//   node scripts/test-superadmin.mjs email@example.com yourpassword

import { createClient } from '@supabase/supabase-js'

const [,, email, password] = process.argv
if (!email || !password) {
  console.error('Usage: node scripts/test-superadmin.mjs <email> <password>')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !anon) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY envs')
  process.exit(1)
}

const supabase = createClient(url, anon)

const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
if (signInErr) {
  console.error('Sign-in failed:', signInErr.message)
  process.exit(1)
}

const { data: { user } } = await supabase.auth.getUser()
if (!user) {
  console.error('No user after sign-in')
  process.exit(1)
}

const { data: roleRow, error: roleErr } = await supabase
  .from('app_users')
  .select('role')
  .eq('user_id', user.id)
  .maybeSingle()

if (roleErr) {
  console.error('Role fetch error:', roleErr.message)
  process.exit(1)
}

if (!roleRow) {
  console.error('No app_users row for this user. Insert one in public.app_users.')
  process.exit(1)
}

console.log('Role:', roleRow.role)
if (roleRow.role !== 'superadmin') {
  console.error('User is not superadmin')
  process.exit(1)
}

console.log('OK: user is superadmin and policy allows read.')
process.exit(0)


