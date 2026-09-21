#!/usr/bin/env node
import { config } from 'dotenv'
import { probePlatformStockContract } from '@/lib/inventory/platform-stock-contract'

config({ path: '.env.local' })
config()

async function main(): Promise<void> {
  const required = process.argv.includes('--require') || process.env.VERCEL_ENV === 'production'
  if (!required) {
    console.log('Platform stock contract check skipped outside a production deployment (use --require to run it).')
    return
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Production deployment requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the stock contract guard.')
  }

  const missing = await probePlatformStockContract({
    restUrl: `${url.replace(/\/$/, '')}/rest/v1`,
    apiKey: key,
  })
  if (missing.length > 0) throw new Error(`Platform stock contract is incomplete: ${missing.join(', ')}`)
  console.log('Platform stock contract OK.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
