import { handlePublicClaimRequest } from '@/lib/loyalty/public-claims-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const POST = handlePublicClaimRequest
