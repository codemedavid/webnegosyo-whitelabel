/** @jest-environment node */
jest.mock('server-only', () => ({}))
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/loyalty/wallet/route'
const rpc = jest.fn()
const settings = { data: null as { wallet_otp_required: boolean } | null, error: null as unknown }
const from = jest.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => settings }) }) }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc, from }) }))
jest.mock('@/lib/loyalty/server-keys', () => ({ loadLoyaltyClaimCrypto: () => ({
  hashPhone: () => 'a'.repeat(64), hashIp: () => 'b'.repeat(64),
  resolveWalletSession: (_tenant: string, token: unknown) => (token === 'good' ? 'c'.repeat(64) : null),
}) }))
beforeEach(() => { rpc.mockReset(); settings.data = null; settings.error = null })
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
it('projects the reward ladder and reward icons with explicit fields only', async () => {
 rpc.mockResolvedValue({data:{ok:true,programs:[{id:'p1',name:'Coffee Club',status:'active',branchName:null,balance:4,secret:'x',rules:{
   earnMode:'stamp',threshold:10,
   reward:{type:'free_item',menuItemId:'meal',itemName:'Meal',imageUrl:'https://img/meal.jpg'},
   milestones:[{at:5,reward:{type:'free_item',menuItemId:'tea',itemName:'Iced Tea',emoji:'🥤'}}],
 }}],rewards:[{id:'r1',expiresAt:null,branchName:null,terms:{programName:'Coffee Club',reward:{type:'free_item',menuItemId:'tea',itemName:'Iced Tea',emoji:'🥤'}}}]},error:null})
 const body = await (await POST(request())).json()
 expect(body.programs[0].rewardSteps).toEqual([
   {at:5,label:'Free Iced Tea',emoji:'🥤',imageUrl:null,isFinal:false},
   {at:10,label:'Free Meal',emoji:'🎁',imageUrl:'https://img/meal.jpg',isFinal:true},
 ])
 expect(body.programs[0]).not.toHaveProperty('secret')
 expect(body.rewards[0]).toMatchObject({label:'Free Iced Tea',emoji:'🥤',imageUrl:null,freeItem:true})
})

describe('stores that text a code before showing rewards', () => {
 const gated = (body: Record<string, unknown> = {}) => new NextRequest('https://store.test/api/loyalty/wallet', { method:'POST', body:JSON.stringify({tenantId:'11111111-1111-4111-8111-111111111111',phone:'09171234567',...body}) })
 beforeEach(() => { settings.data = { wallet_otp_required: true } })
 it('asks for verification without spending the lookup quota', async () => {
  const response = await POST(gated())
  expect(response.status).toBe(401)
  expect(await response.json()).toEqual({ error: 'Verify your number to see your rewards.', reason: 'verification_required' })
  expect(rpc).not.toHaveBeenCalled()
 })
 it('refuses a forged or foreign session token', async () => {
  const response = await POST(gated({ sessionToken: 'forged' }))
  expect(response.status).toBe(401)
  expect(rpc).not.toHaveBeenCalled()
 })
 it('refuses a signed session the database no longer honours', async () => {
  rpc.mockResolvedValueOnce({ data: false, error: null })
  const response = await POST(gated({ sessionToken: 'good' }))
  expect(response.status).toBe(401)
  expect(rpc).toHaveBeenCalledWith('loyalty_wallet_session_valid', { p_tenant_id: '11111111-1111-4111-8111-111111111111', p_token_hash: 'c'.repeat(64), p_phone_hash: 'a'.repeat(64) })
 })
 it('shows the wallet to a verified number', async () => {
  rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: { ok: true, programs: [], rewards: [] }, error: null })
  const response = await POST(gated({ sessionToken: 'good' }))
  expect(response.status).toBe(200)
  expect(rpc).toHaveBeenLastCalledWith('lookup_loyalty_wallet', expect.anything())
 })
 it('fails closed when the session cannot be checked', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'down' } })
  const response = await POST(gated({ sessionToken: 'good' }))
  expect(response.status).toBe(503)
  expect(rpc).toHaveBeenCalledTimes(1)
 })
 it('fails closed when the store setting cannot be read', async () => {
  settings.data = null
  settings.error = { message: 'down' }
  const response = await POST(gated())
  expect(response.status).toBe(503)
  expect(rpc).not.toHaveBeenCalled()
 })
})
