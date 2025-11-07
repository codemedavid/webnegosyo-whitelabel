#!/usr/bin/env node

/**
 * Diagnose Payment Methods Error
 * Check the existing payment method and its order type associations
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

console.log('🔍 Diagnosing Payment Methods Issue...\n')

// Get all payment methods
console.log('📋 Fetching payment methods...')
const { data: paymentMethods, error: pmError } = await supabase
  .from('payment_methods')
  .select('*')

if (pmError) {
  console.log('❌ Error fetching payment methods:', pmError.message)
  process.exit(1)
}

console.log(`✅ Found ${paymentMethods.length} payment method(s)\n`)

if (paymentMethods.length === 0) {
  console.log('ℹ️  No payment methods exist yet. Try creating one in the admin panel.\n')
} else {
  paymentMethods.forEach((pm, index) => {
    console.log(`Payment Method ${index + 1}:`)
    console.log(`   ID: ${pm.id}`)
    console.log(`   Name: ${pm.name}`)
    console.log(`   Details: ${pm.details || 'None'}`)
    console.log(`   QR Code: ${pm.qr_code_url || 'None'}`)
    console.log(`   Active: ${pm.is_active ? '✅' : '❌'}`)
    console.log(`   Tenant ID: ${pm.tenant_id}`)
    console.log('')
  })
}

// Get all order type associations
console.log('📋 Fetching payment method order type associations...')
const { data: associations, error: assocError } = await supabase
  .from('payment_method_order_types')
  .select(`
    *,
    payment_methods(name),
    order_types(name, type)
  `)

if (assocError) {
  console.log('❌ Error fetching associations:', assocError.message)
} else {
  console.log(`✅ Found ${associations.length} association(s)\n`)
  
  if (associations.length === 0) {
    console.log('⚠️  No payment methods are associated with order types yet!')
    console.log('   This is why they don\'t show at checkout.\n')
    console.log('💡 To fix:')
    console.log('   1. Go to /admin/payment-methods')
    console.log('   2. Click edit on a payment method')
    console.log('   3. Check the order types checkboxes')
    console.log('   4. Save\n')
  } else {
    associations.forEach((assoc, index) => {
      console.log(`Association ${index + 1}:`)
      console.log(`   Payment Method: ${assoc.payment_methods?.name || 'Unknown'}`)
      console.log(`   Order Type: ${assoc.order_types?.name || 'Unknown'} (${assoc.order_types?.type || 'Unknown'})`)
      console.log('')
    })
  }
}

// Test with a specific tenant
if (paymentMethods.length > 0) {
  const testTenantId = paymentMethods[0].tenant_id
  
  console.log(`📋 Testing query for tenant ${testTenantId.slice(0, 8)}...`)
  
  // Get order types for this tenant
  const { data: orderTypes, error: otError } = await supabase
    .from('order_types')
    .select('*')
    .eq('tenant_id', testTenantId)
    .eq('is_enabled', true)

  if (otError) {
    console.log('❌ Error fetching order types:', otError.message)
  } else {
    console.log(`✅ Found ${orderTypes.length} enabled order type(s)`)
    
    if (orderTypes.length > 0) {
      const testOrderType = orderTypes[0]
      console.log(`   Testing with order type: ${testOrderType.name} (${testOrderType.id})\n`)
      
      // Try to get payment methods for this order type (like checkout does)
      console.log('📋 Simulating checkout query...')
      const { data: checkoutPaymentMethods, error: checkoutError } = await supabase
        .from('payment_methods')
        .select(`
          *,
          payment_method_order_types!inner(order_type_id)
        `)
        .eq('tenant_id', testTenantId)
        .eq('is_active', true)
        .eq('payment_method_order_types.order_type_id', testOrderType.id)
        .order('order_index', { ascending: true })

      if (checkoutError) {
        console.log('❌ Checkout query failed:', checkoutError.message)
        console.log('   This is why payment methods don\'t show at checkout!\n')
      } else {
        console.log(`✅ Checkout would show ${checkoutPaymentMethods.length} payment method(s)`)
        if (checkoutPaymentMethods.length === 0) {
          console.log('   ⚠️  None found because no associations exist!')
        } else {
          checkoutPaymentMethods.forEach(pm => {
            console.log(`   - ${pm.name}`)
          })
        }
        console.log('')
      }
    }
  }
}

console.log('=' .repeat(60))
console.log('🎯 DIAGNOSIS COMPLETE')
console.log('=' .repeat(60))

