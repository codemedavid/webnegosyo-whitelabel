#!/usr/bin/env node

/**
 * Diagnostic script to check custom domain resolution for a tenant
 * Usage: node scripts/check-domain-resolution.mjs walsikopi.com
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// Load .env.local manually
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')
try {
    const envContent = readFileSync(envPath, 'utf-8')
    envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=')
        if (key && valueParts.length > 0) {
            const value = valueParts.join('=').trim()
            if (!process.env[key.trim()]) {
                process.env[key.trim()] = value
            }
        }
    })
} catch (e) {
    console.warn('Could not load .env.local:', e.message)
}

const domain = process.argv[2] || 'walsikopi.com'

// Normalize domain (same logic as tenant.ts)
function normalizeDomain(domain) {
    if (!domain) return null

    // Remove protocol
    let normalized = domain.replace(/^https?:\/\//i, '')

    // Remove www. prefix
    normalized = normalized.replace(/^www\./i, '')

    // Remove trailing slashes and whitespace
    normalized = normalized.replace(/\/+$/, '').trim()

    // Convert to lowercase
    normalized = normalized.toLowerCase()

    // Basic validation: must contain at least one dot
    if (!normalized.includes('.')) return null

    return normalized || null
}

async function checkDomainResolution() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
        console.error('❌ Missing Supabase environment variables')
        process.exit(1)
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log('\n🔍 Domain Resolution Diagnostic')
    console.log('================================\n')

    const normalizedDomain = normalizeDomain(domain)
    console.log(`Input domain: "${domain}"`)
    console.log(`Normalized domain: "${normalizedDomain}"`)
    console.log('')

    // Check exact match
    console.log('📋 Checking for exact domain match...')
    const { data: exactMatch, error: exactError } = await supabase
        .from('tenants')
        .select('id, slug, name, domain, is_active')
        .eq('domain', normalizedDomain)
        .maybeSingle()

    if (exactError) {
        console.error('❌ Database error:', exactError.message)
    } else if (exactMatch) {
        console.log('✅ Found exact match:')
        console.log(`   ID: ${exactMatch.id}`)
        console.log(`   Name: ${exactMatch.name}`)
        console.log(`   Slug: ${exactMatch.slug}`)
        console.log(`   Domain: "${exactMatch.domain}"`)
        console.log(`   Is Active: ${exactMatch.is_active}`)

        if (!exactMatch.is_active) {
            console.log('\n⚠️  WARNING: Tenant is NOT active! Domain resolution will fail.')
        }
    } else {
        console.log('❌ No exact match found')
    }

    // Check www variant - only if normalizedDomain is valid
    if (normalizedDomain) {
        const wwwVariant = normalizedDomain.startsWith('www.')
            ? normalizedDomain.replace(/^www\./, '')
            : `www.${normalizedDomain}`

        console.log(`\n📋 Checking for www variant: "${wwwVariant}"...`)
        const { data: wwwMatch, error: wwwError } = await supabase
            .from('tenants')
            .select('id, slug, name, domain, is_active')
            .eq('domain', wwwVariant)
            .maybeSingle()

        if (wwwError) {
            console.error('❌ Database error:', wwwError.message)
        } else if (wwwMatch) {
            console.log('✅ Found www variant match:')
            console.log(`   ID: ${wwwMatch.id}`)
            console.log(`   Name: ${wwwMatch.name}`)
            console.log(`   Slug: ${wwwMatch.slug}`)
            console.log(`   Domain: "${wwwMatch.domain}"`)
            console.log(`   Is Active: ${wwwMatch.is_active}`)
        } else {
            console.log('❌ No www variant match found')
        }
    } else {
        console.log('\n⚠️ Skipping www variant check - normalizedDomain is null')
    }

    // List ALL tenants with domains
    console.log('\n📋 All tenants with custom domains configured:')
    const { data: allWithDomains, error: allError } = await supabase
        .from('tenants')
        .select('id, slug, name, domain, is_active')
        .not('domain', 'is', null)
        .order('name')

    if (allError) {
        console.error('❌ Database error:', allError.message)
    } else if (allWithDomains && allWithDomains.length > 0) {
        console.log('')
        allWithDomains.forEach(t => {
            const status = t.is_active ? '✅' : '❌'
            console.log(`   ${status} ${t.name} (${t.slug})`)
            console.log(`      Domain: "${t.domain}"`)
        })
    } else {
        console.log('   No tenants have custom domains configured')
    }

    // Check if domain contains unexpected characters
    console.log('\n📋 Domain stored value analysis:')
    if (exactMatch?.domain) {
        const storedDomain = exactMatch.domain
        console.log(`   Length: ${storedDomain.length} characters`)
        console.log(`   Has leading/trailing spaces: ${storedDomain !== storedDomain.trim()}`)
        console.log(`   Has protocol (http/https): ${/^https?:\/\//i.test(storedDomain)}`)
        console.log(`   Has www prefix: ${/^www\./i.test(storedDomain)}`)
        console.log(`   Is lowercase: ${storedDomain === storedDomain.toLowerCase()}`)

        // Char by char analysis for hidden characters
        const hiddenChars = []
        for (let i = 0; i < storedDomain.length; i++) {
            const code = storedDomain.charCodeAt(i)
            if (code < 32 || code > 126) {
                hiddenChars.push({ pos: i, char: storedDomain[i], code })
            }
        }
        if (hiddenChars.length > 0) {
            console.log(`   ⚠️ Hidden/non-printable characters found:`, hiddenChars)
        } else {
            console.log(`   No hidden characters detected`)
        }
    }

    console.log('\n================================')
    console.log('Diagnostic complete!\n')
}

checkDomainResolution().catch(console.error)
