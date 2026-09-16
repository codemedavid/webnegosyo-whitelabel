/** @jest-environment node */
jest.mock('server-only', () => ({}))
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/loyalty/wallet/route'
const rpc = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }))
jest.mock('@/lib/loyalty/server-keys', () => ({ loadLoyaltyClaimCrypto: () => ({ hashPhone: () => 'a'.repeat(64), hashIp: () => 'b'.repeat(64) }) }))
jest.mock('@/lib/loyalty/public-ingress', () => ({ getLoyaltyTrustedIp: () => '203.0.113.1' }))
const request = () => new NextRequest('https://store.test/api/loyalty/wallet', { method:'POST', body:JSON.stringify({tenantId:'11111111-1111-4111-8111-111111111111',phone:'09171234567'}) })
it('returns only the public wallet and disables caching', async () => {
 rpc.mockResolvedValue({data:{ok:true,programs:[],rewards:[]},error:null})
 const response = await POST(request())
 expect(response.status).toBe(200)
 expect(response.headers.get('cache-control')).toBe('no-store')
 expect(await response.json()).toMatchObject({programs:[],rewards:[]})
 expect(rpc).toHaveBeenCalledWith('lookup_loyalty_wallet',expect.objectContaining({p_customer_key:'phone:+639171234567',p_phone_hash:'a'.repeat(64),p_ip_hash:'b'.repeat(64)}))
})
it('refuses exhausted quotas without reading customer history', async () => {
 rpc.mockResolvedValue({data:{ok:false,error:'rate_limited'},error:null})
 const response = await POST(request())
 expect(response.status).toBe(429)
})
it('does not expose storage failures', async () => {
 rpc.mockResolvedValue({data:null,error:{message:'private database info'}})
 const response = await POST(request())
 expect(response.status).toBe(503)
 expect(JSON.stringify(await response.json())).not.toContain('private database')
})
