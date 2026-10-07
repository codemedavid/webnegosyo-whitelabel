import { handleWalletCodeVerify } from '@/lib/loyalty/wallet-verification-http'

// Trades a correct code for a 30-minute rewards-page session.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const POST = handleWalletCodeVerify
