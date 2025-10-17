#!/usr/bin/env node
/**
 * Check Database Status
 * 
 * Run: node scripts/check-database.mjs
 * 
 * This script checks:
 * - Superadmin users
 * - Existing tenants
 * - Active tenants
 * - Helps you understand what's in your database
 */

import { createClient } from '@supabase/supabase-js'

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  console.error('   NEXT_PUBLIC_SUPABASE_URL')
  console.error('   NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

console.log('🔍 Checking Database Status...\n')

// Check app_users
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('👤 APP USERS')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

const { data: appUsers, error: usersError } = await supabase
  .from('app_users')
  .select('user_id, role, created_at')

if (usersError) {
  console.error('❌ Error fetching app_users:', usersError.message)
} else if (!appUsers || appUsers.length === 0) {
  console.log('⚠️  No users found in app_users table')
  console.log('\n📝 To create a superadmin:')
  console.log('   1. Sign up a user via Supabase Auth')
  console.log('   2. Run: npm run test:superadmin <email> <password>')
  console.log('   3. Or insert manually in SQL Editor:')
  console.log('      INSERT INTO app_users (user_id, role) VALUES (\'user-id\', \'superadmin\');')
} else {
  appUsers.forEach((user, i) => {
    console.log(`${i + 1}. User: ${user.user_id.slice(0, 8)}...`)
    console.log(`   Role: ${user.role}`)
    console.log(`   Created: ${new Date(user.created_at).toLocaleDateString()}`)
  })
  
  const superadmins = appUsers.filter(u => u.role === 'superadmin')
  if (superadmins.length === 0) {
    console.log('\n⚠️  No superadmin users found!')
  } else {
    console.log(`\n✅ Found ${superadmins.length} superadmin(s)`)
  }
}

// Check tenants
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('🏪 TENANTS')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

const { data: tenants, error: tenantsError } = await supabase
  .from('tenants')
  .select('id, name, slug, is_active, created_at')
  .order('created_at', { ascending: false })

if (tenantsError) {
  console.error('❌ Error fetching tenants:', tenantsError.message)
} else if (!tenants || tenants.length === 0) {
  console.log('⚠️  No tenants found!')
  console.log('\n📝 To create a tenant:')
  console.log('   1. Login to superadmin: /superadmin/login')
  console.log('   2. Go to: /superadmin/tenants')
  console.log('   3. Click "Add Tenant"')
} else {
  tenants.forEach((tenant, i) => {
    const status = tenant.is_active ? '✅ Active' : '⛔ Inactive'
    console.log(`${i + 1}. ${status} - ${tenant.name}`)
    console.log(`   Slug: ${tenant.slug}`)
    console.log(`   Created: ${new Date(tenant.created_at).toLocaleDateString()}`)
    
    if (tenant.is_active) {
      console.log(`   📱 Customer: /{tenant.slug}/menu`)
      console.log(`   ⚙️  Admin: /{tenant.slug}/admin`)
    }
  })
  
  const active = tenants.filter(t => t.is_active)
  console.log(`\n✅ Total: ${tenants.length} tenant(s), ${active.length} active`)
}

// Summary
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('📊 SUMMARY')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

if (appUsers && appUsers.length > 0 && tenants && tenants.length > 0) {
  console.log('✅ Database is set up!')
  console.log('\n🌐 You can now access:')
  console.log('   • Superadmin: https://your-domain.vercel.app/superadmin')
  
  const activeTenants = tenants.filter(t => t.is_active)
  if (activeTenants.length > 0) {
    activeTenants.forEach(t => {
      console.log(`   • ${t.name}: https://your-domain.vercel.app/${t.slug}/menu`)
    })
  }
} else {
  console.log('⚠️  Setup incomplete:')
  if (!appUsers || appUsers.length === 0) {
    console.log('   ❌ No users - Create a superadmin user')
  }
  if (!tenants || tenants.length === 0) {
    console.log('   ❌ No tenants - Create at least one tenant')
  }
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

