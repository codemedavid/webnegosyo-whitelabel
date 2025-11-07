#!/usr/bin/env node

/**
 * Test RLS Policies for Payment Methods
 * Check if the current user can perform operations
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

console.log('🔍 Testing RLS Policies for Payment Methods...\n')

// Check current user
console.log('📋 Checking authentication...')
const { data: { user }, error: userError } = await supabase.auth.getUser()

if (userError || !user) {
  console.log('❌ Not authenticated')
  console.log('   Please log in as admin first\n')
  process.exit(1)
}

console.log('✅ Authenticated as:', user.email)
console.log(`   User ID: ${user.id}\n`)

// Check app_users role
console.log('📋 Checking user role...')
const { data: appUser, error: roleError } = await supabase
  .from('app_users')
  .select('role, tenant_id')
  .eq('user_id', user.id)
  .single()

if (roleError) {
  console.log('❌ Error fetching role:', roleError.message)
  console.log('   User might not be set up as admin\n')
} else {
  console.log('✅ User role:', appUser.role)
  console.log(`   Tenant ID: ${appUser.tenant_id || 'None (superadmin)'}\n`)
}

// Test read access to payment_methods
console.log('📋 Testing READ access to payment_methods...')
const { data: readPMs, error: readError } = await supabase
  .from('payment_methods')
  .select('*')
  .limit(5)

if (readError) {
  console.log('❌ Read failed:', readError.message)
} else {
  console.log(`✅ Can read payment methods: ${readPMs.length} found\n`)
}

// Test read access to payment_method_order_types
console.log('📋 Testing READ access to payment_method_order_types...')
const { data: readAssoc, error: readAssocError } = await supabase
  .from('payment_method_order_types')
  .select('*')
  .limit(5)

if (readAssocError) {
  console.log('❌ Read failed:', readAssocError.message)
} else {
  console.log(`✅ Can read associations: ${readAssoc.length} found\n`)
}

// Test write access (if admin)
if (appUser && appUser.tenant_id) {
  console.log('📋 Testing WRITE access...')
  
  // Try to insert a test association (then delete it)
  const { data: testPM } = await supabase
    .from('payment_methods')
    .select('id')
    .eq('tenant_id', appUser.tenant_id)
    .limit(1)
    .single()

  const { data: testOT } = await supabase
    .from('order_types')
    .select('id')
    .eq('tenant_id', appUser.tenant_id)
    .limit(1)
    .single()

  if (testPM && testOT) {
    console.log('   Testing insert...')
    const { data: insertData, error: insertError } = await supabase
      .from('payment_method_order_types')
      .insert({
        payment_method_id: testPM.id,
        order_type_id: testOT.id,
      })
      .select()

    if (insertError) {
      console.log('   ❌ Insert failed:', insertError.message)
      console.log('   ⚠️  This might be a RLS policy issue!')
      
      // Check if it's a unique constraint error (already exists)
      if (insertError.code === '23505') {
        console.log('   (Association already exists - that\'s okay)')
      }
    } else {
      console.log('   ✅ Insert succeeded')
      
      // Clean up test data
      if (insertData && insertData.length > 0) {
        await supabase
          .from('payment_method_order_types')
          .delete()
          .eq('id', insertData[0].id)
        console.log('   (Test data cleaned up)')
      }
    }
  }
  console.log('')
}

console.log('=' .repeat(60))
console.log('📊 RLS POLICY TEST COMPLETE')
console.log('=' .repeat(60))

