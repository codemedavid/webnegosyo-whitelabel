/** @jest-environment node */
jest.mock('server-only',()=>({}))
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/loyalty/quotes/route'
const rpc=jest.fn(), from=jest.fn()
jest.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc,from})}))
jest.mock('@/lib/loyalty/merchant-http',()=>({...jest.requireActual('@/lib/loyalty/merchant-http'),authenticateMerchant:async()=>({ok:true,userId:'actor',member:{role:'admin',is_owner:true}})}))
jest.mock('@/lib/loyalty/server-keys',()=>({loadLoyaltyClaimCrypto:()=>({resolveClaim:(_tenant:string,token:string)=>token==='valid-token'?'a'.repeat(64):null})}))
const issue=jest.fn()
jest.mock('@/lib/loyalty/quote-issuer',()=>({LoyaltyQuoteError:class extends Error{},issueLoyaltyQuote:(...args:unknown[])=>issue(...args)}))
const tenantId='11111111-1111-4111-8111-111111111111'
const request=(extra={})=>new NextRequest('https://store.test/api/loyalty/quotes',{method:'POST',body:JSON.stringify({tenantId,claimToken:'valid-token',requestId:'22222222-2222-4222-8222-222222222222',outletId:null,orderTypeId:'33333333-3333-4333-8333-333333333333',cart:{lines:[{menuItemId:'44444444-4444-4444-8444-444444444444',quantity:1,selectedOptionIds:[]}]},...extra})})
beforeEach(()=>{process.env.LOYALTY_POS_SETTLEMENT_ENABLED='true';issue.mockReset().mockResolvedValue({quoteId:'quote',totalCentavos:5000})})
afterAll(()=>{delete process.env.LOYALTY_POS_SETTLEMENT_ENABLED})
it('passes only a verified claim hash and authenticated actor to issuance',async()=>{
 const response=await POST(request())
 expect(response.status).toBe(200)
 expect(issue).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({actor:'actor',claimHash:'a'.repeat(64)}))
 expect(response.headers.get('cache-control')).toBe('no-store')
})
it('rejects tampered claims and client prices',async()=>{
 expect((await POST(request({claimToken:'bad'}))).status).toBe(400)
 expect((await POST(request({total:1}))).status).toBe(400)
 expect(issue).not.toHaveBeenCalled()
})
it('is unavailable while settlement remains gated',async()=>{
 delete process.env.LOYALTY_POS_SETTLEMENT_ENABLED
 expect((await POST(request())).status).toBe(503)
 expect(issue).not.toHaveBeenCalled()
})
