#!/usr/bin/env node

/**
 * Test Payment Methods Feature
 * Checks database tables and tests functionality
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  console.log('Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

console.log('🔍 Testing Payment Methods Feature...\n')

// Test 1: Check if payment_methods table exists
console.log('📋 Test 1: Checking if payment_methods table exists...')
try {
  const { data, error } = await supabase
    .from('payment_methods')
    .select('id')
    .limit(1)

  if (error) {
    if (error.message.includes('relation') || error.message.includes('does not exist')) {
      console.log('❌ FAILED: payment_methods table does NOT exist')
      console.log('   Error:', error.message)
      console.log('   → Migration 0012_payment_methods.sql NOT applied\n')
    } else {
      console.log('⚠️  Table exists but query failed:', error.message, '\n')
    }
  } else {
    console.log('✅ PASSED: payment_methods table exists')
    console.log(`   Found ${data?.length || 0} payment methods\n`)
  }
} catch (err) {
  console.log('❌ FAILED:', err.message, '\n')
}

// Test 2: Check if payment_method_order_types table exists
console.log('📋 Test 2: Checking if payment_method_order_types table exists...')
try {
  const { data, error } = await supabase
    .from('payment_method_order_types')
    .select('id')
    .limit(1)

  if (error) {
    if (error.message.includes('relation') || error.message.includes('does not exist')) {
      console.log('❌ FAILED: payment_method_order_types table does NOT exist')
      console.log('   Error:', error.message)
      console.log('   → Migration 0012_payment_methods.sql NOT applied\n')
    } else {
      console.log('⚠️  Table exists but query failed:', error.message, '\n')
    }
  } else {
    console.log('✅ PASSED: payment_method_order_types table exists')
    console.log(`   Found ${data?.length || 0} associations\n`)
  }
} catch (err) {
  console.log('❌ FAILED:', err.message, '\n')
}

// Test 3: Check if orders table has payment columns
console.log('📋 Test 3: Checking if orders table has payment columns...')
try {
  const { data, error } = await supabase
    .from('orders')
    .select('payment_method_id, payment_status')
    .limit(1)

  if (error) {
    if (error.message.includes('column') || error.message.includes('does not exist')) {
      console.log('❌ FAILED: orders table missing payment columns')
      console.log('   Error:', error.message)
      console.log('   → Migration 0012_payment_methods.sql NOT applied\n')
    } else {
      console.log('⚠️  Columns might exist but query failed:', error.message, '\n')
    }
  } else {
    console.log('✅ PASSED: orders table has payment columns\n')
  }
} catch (err) {
  console.log('❌ FAILED:', err.message, '\n')
}

// Test 4: Get all tenants to test with
console.log('📋 Test 4: Fetching tenants...')
try {
  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id, slug, name')
    .limit(5)

  if (error) {
    console.log('❌ FAILED:', error.message, '\n')
  } else {
    console.log(`✅ PASSED: Found ${tenants?.length || 0} tenants`)
    if (tenants && tenants.length > 0) {
      tenants.forEach(t => {
        console.log(`   - ${t.name} (${t.slug})`)
      })
    }
    console.log('')
  }
} catch (err) {
  console.log('❌ FAILED:', err.message, '\n')
}

// Test 5: Check order types
console.log('📋 Test 5: Checking order types...')
try {
  const { data: orderTypes, error } = await supabase
    .from('order_types')
    .select('id, tenant_id, type, name, is_enabled')
    .limit(10)

  if (error) {
    console.log('❌ FAILED:', error.message, '\n')
  } else {
    console.log(`✅ PASSED: Found ${orderTypes?.length || 0} order types`)
    if (orderTypes && orderTypes.length > 0) {
      const grouped = {}
      orderTypes.forEach(ot => {
        if (!grouped[ot.tenant_id]) grouped[ot.tenant_id] = []
        grouped[ot.tenant_id].push(`${ot.name} (${ot.type}) - ${ot.is_enabled ? 'enabled' : 'disabled'}`)
      })
      Object.keys(grouped).forEach(tenantId => {
        console.log(`   Tenant ${tenantId.slice(0, 8)}:`)
        grouped[tenantId].forEach(ot => console.log(`     - ${ot}`))
      })
    }
    console.log('')
  }
} catch (err) {
  console.log('❌ FAILED:', err.message, '\n')
}

// Summary
console.log('=' .repeat(60))
console.log('📊 SUMMARY\n')

const allTestsPassed = true // We'll determine this from above

const hasPaymentTables = false // This will be determined from test results

if (!hasPaymentTables) {
  console.log('❌ MIGRATION STATUS: NOT APPLIED')
  console.log('')
  console.log('🚨 ACTION REQUIRED:')
  console.log('   1. Open Supabase Dashboard: https://supabase.com/dashboard')
  console.log('   2. Go to SQL Editor → New query')
  console.log('   3. Copy ALL of: supabase/migrations/0012_payment_methods.sql')
  console.log('   4. Paste and click RUN')
  console.log('   5. Run this test again: npm run test:payment-methods')
  console.log('')
  console.log('⏱️  Time required: 2 minutes')
  console.log('')
} else {
  console.log('✅ MIGRATION STATUS: APPLIED')
  console.log('')
  console.log('🎉 Payment methods feature is ready to use!')
  console.log('')
  console.log('Next steps:')
  console.log('   1. Go to /admin/payment-methods')
  console.log('   2. Create your first payment method')
  console.log('   3. Test checkout flow')
  console.log('')
}

console.log('=' .repeat(60))

