#!/usr/bin/env node
/**
 * Create Test Tenant
 * 
 * Run: node scripts/create-test-tenant.mjs
 * 
 * Creates a sample restaurant tenant for testing
 */

import { createClient } from '@supabase/supabase-js'

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

console.log('🏪 Creating Test Tenant...\n')

const testTenant = {
  name: 'Bella Italia',
  slug: 'bella-italia',
  logo_url: '',
  primary_color: '#c41e3a',
  secondary_color: '#009246',
  accent_color: '#ffd700',
  messenger_page_id: '123456789',
  messenger_username: 'bellaitalia',
  is_active: true,
}

// Check if slug already exists
const { data: existing } = await supabase
  .from('tenants')
  .select('slug')
  .eq('slug', testTenant.slug)
  .maybeSingle()

if (existing) {
  console.log('⚠️  Tenant with slug "bella-italia" already exists!')
  console.log('   Visit: /' + testTenant.slug + '/menu')
  process.exit(0)
}

// Create tenant
const { data: tenant, error } = await supabase
  .from('tenants')
  .insert(testTenant)
  .select()
  .single()

if (error) {
  console.error('❌ Error creating tenant:', error.message)
  console.error('\nPossible issues:')
  console.error('   • RLS policies blocking insert')
  console.error('   • Missing permissions')
  console.error('   • Use service role key for admin operations')
  process.exit(1)
}

console.log('✅ Test tenant created successfully!\n')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('📋 Tenant Details')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`Name: ${tenant.name}`)
console.log(`Slug: ${tenant.slug}`)
console.log(`Colors: ${tenant.primary_color}, ${tenant.secondary_color}, ${tenant.accent_color}`)
console.log(`\n🌐 Access URLs:`)
console.log(`   • Customer Menu: /${tenant.slug}/menu`)
console.log(`   • Admin Panel: /${tenant.slug}/admin`)
console.log(`   • Cart: /${tenant.slug}/cart`)
console.log(`   • Checkout: /${tenant.slug}/checkout`)
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

