import { handleWalletCodeRequest } from '@/lib/loyalty/wallet-verification-http'

// Texts a code before the rewards page shows anything (store setting).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const POST = handleWalletCodeRequest
