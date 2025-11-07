#!/usr/bin/env node

/**
 * Test the exact query that checkout uses
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

console.log('🔍 Testing Checkout Payment Methods Query...\n')

// Get a tenant and order type to test with
const { data: tenants } = await supabase.from('tenants').select('id, name, slug').limit(1)
if (!tenants || tenants.length === 0) {
  console.log('❌ No tenants found')
  process.exit(1)
}

const tenant = tenants[0]
console.log(`Testing with tenant: ${tenant.name} (${tenant.slug})`)
console.log(`Tenant ID: ${tenant.id}\n`)

// Get order types for this tenant
const { data: orderTypes } = await supabase
  .from('order_types')
  .select('*')
  .eq('tenant_id', tenant.id)
  .eq('is_enabled', true)

console.log(`Found ${orderTypes?.length || 0} enabled order types:\n`)

if (!orderTypes || orderTypes.length === 0) {
  console.log('❌ No order types found for this tenant')
  process.exit(1)
}

// Test the checkout query for EACH order type
for (const orderType of orderTypes) {
  console.log(`\n📋 Testing: ${orderType.name} (${orderType.type})`)
  console.log(`   Order Type ID: ${orderType.id}`)
  
  // This is the EXACT query used in checkout
  const { data: paymentMethods, error } = await supabase
    .from('payment_methods')
    .select(`
      *,
      payment_method_order_types!inner(order_type_id)
    `)
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .eq('payment_method_order_types.order_type_id', orderType.id)
    .order('order_index', { ascending: true })

  if (error) {
    console.log(`   ❌ Query failed: ${error.message}`)
  } else {
    console.log(`   ✅ Query succeeded: ${paymentMethods.length} payment method(s) found`)
    
    if (paymentMethods.length === 0) {
      console.log('   ⚠️  No payment methods associated with this order type!')
      console.log('   → Payment selection won\'t show at checkout')
    } else {
      paymentMethods.forEach(pm => {
        console.log(`      - ${pm.name}`)
      })
    }
  }
}

console.log('\n' + '='.repeat(60))
console.log('📊 DIAGNOSIS\n')

// Check if any payment methods exist
const { data: allPaymentMethods } = await supabase
  .from('payment_methods')
  .select('id, name')
  .eq('tenant_id', tenant.id)

console.log(`Total payment methods for tenant: ${allPaymentMethods?.length || 0}`)

// Check if any associations exist
const { data: allAssociations } = await supabase
  .from('payment_method_order_types')
  .select('id, payment_method_id, order_type_id')

console.log(`Total order type associations: ${allAssociations?.length || 0}\n`)

if ((allPaymentMethods?.length || 0) > 0 && (allAssociations?.length || 0) === 0) {
  console.log('🚨 PROBLEM IDENTIFIED:')
  console.log('   You have payment methods, but they\'re not linked to any order types!\n')
  console.log('✅ SOLUTION:')
  console.log('   1. Go to /admin/payment-methods')
  console.log('   2. Click EDIT on your payment method')
  console.log('   3. CHECK the order type checkboxes (Pick Up, Delivery, Dine In)')
  console.log('   4. Click Save')
  console.log('   5. Go to checkout - payment methods should now appear!\n')
} else if ((allPaymentMethods?.length || 0) === 0) {
  console.log('ℹ️  No payment methods created yet.')
  console.log('   Create one in /admin/payment-methods\n')
} else {
  console.log('✅ Everything looks good!')
  console.log('   Payment methods should appear at checkout.\n')
}

console.log('='.repeat(60))

