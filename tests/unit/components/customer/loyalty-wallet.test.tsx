import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LoyaltyWalletPage } from '@/components/customer/loyalty-wallet-page'
jest.mock('qrcode.react', () => ({ QRCodeSVG: ({value}:{value:string}) => <div data-testid="claim-qr">{value}</div> }))
afterEach(() => jest.useRealTimers())
it('looks up a phone, selects a reward, verifies a code, and displays its claim QR', async () => {
 const fetcher = jest.fn()
  .mockResolvedValueOnce({ok:true,json:async()=>({programs:[],rewards:[{id:'reward',programName:'Coffee',label:'₱50 off',expiresAt:null,branchName:null,freeItem:false}],claimsAvailable:true})})
  .mockResolvedValueOnce({ok:true,json:async()=>({accepted:true,challengeId:'challenge',expiresInSeconds:300})})
  .mockResolvedValueOnce({ok:true,json:async()=>({token:'opaque-token',expiresAt:new Date(Date.now()+120000).toISOString()})})
 global.fetch=fetcher
 render(<LoyaltyWalletPage tenantId="tenant" tenantSlug="shop" storeName="Coffee shop" />)
 fireEvent.change(screen.getByLabelText('Mobile number'),{target:{value:'09171234567'}})
 fireEvent.click(screen.getByRole('button',{name:'Check my rewards'}))
 fireEvent.click(await screen.findByRole('button',{name:'Get QR for ₱50 off'}))
 fireEvent.change(await screen.findByLabelText('SMS code'),{target:{value:'123456'}})
 fireEvent.click(screen.getByRole('button',{name:'Verify code'}))
 expect(await screen.findByTestId('claim-qr')).toHaveTextContent('opaque-token')
 expect(screen.getByText(/reward is used only when the cashier/i)).toBeInTheDocument()
 expect(fetcher.mock.calls[2][1].body).toContain('"challengeId":"challenge"')
 fireEvent.click(screen.getByRole('button',{name:'Use another number'}))
 expect(screen.queryByTestId('claim-qr')).not.toBeInTheDocument()
 await waitFor(()=>expect(screen.getByLabelText('Mobile number')).toHaveValue(''))
})

it('refreshes the wallet on focus and preserves progress when the refresh fails', async () => {
 const wallet = { programs:[{id:'program',name:'Coffee',earnMode:'stamp',balance:1,threshold:10,rewardLabel:'Free coffee',status:'active',branchName:null,minSpend:null}], rewards:[], claimsAvailable:true }
 global.fetch = jest.fn().mockResolvedValueOnce({ok:true,json:async()=>wallet})
  .mockResolvedValueOnce({ok:false,json:async()=>({error:'Temporarily unavailable'})})
  .mockResolvedValue({ok:true,json:async()=>({...wallet,programs:[{...wallet.programs[0],balance:2}]})})
 render(<LoyaltyWalletPage tenantId="tenant" tenantSlug="shop" storeName="Coffee shop" />)
 fireEvent.change(screen.getByLabelText('Mobile number'),{target:{value:'09171234567'}})
 fireEvent.click(screen.getByRole('button',{name:'Check my rewards'}))
 expect(await screen.findByText(/1 \/ 10 stamps/)).toBeInTheDocument()
 fireEvent(window,new Event('focus'))
 expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable/i)
 expect(screen.getByText(/1 \/ 10 stamps/)).toBeInTheDocument()
 fireEvent(window,new Event('online'))
 expect(await screen.findByText(/2 \/ 10 stamps/)).toBeInTheDocument()
})

it('ignores a previous number refresh response and failure after switching numbers', async () => {
 let rejectRefresh!: (reason: Error) => void
 const wallet = {programs:[],rewards:[{id:'reward',programName:'Coffee',label:'Old reward',expiresAt:null,branchName:null,freeItem:false}],claimsAvailable:true}
 global.fetch = jest.fn().mockResolvedValueOnce({ok:true,json:async()=>wallet})
  .mockImplementationOnce(()=>new Promise((_,reject)=>{rejectRefresh=reject}))
 render(<LoyaltyWalletPage tenantId="tenant" tenantSlug="shop" storeName="Coffee shop" />)
 fireEvent.change(screen.getByLabelText('Mobile number'),{target:{value:'09171234567'}})
 fireEvent.click(screen.getByRole('button',{name:'Check my rewards'}))
 await screen.findByText('Old reward')
 fireEvent.click(screen.getByRole('button',{name:'Refresh rewards'}))
 fireEvent.click(screen.getByRole('button',{name:'Use another number'}))
 await waitFor(()=>expect(screen.getByLabelText('Mobile number')).toHaveValue(''))
 await act(async()=>{rejectRefresh(new Error('Old error'))})
 expect(screen.queryByRole('alert')).not.toBeInTheDocument()
 expect(screen.queryByText('Old reward')).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:'Check my rewards'})).toBeEnabled()
})

it('removes a used reward QR while the customer keeps the screen open at the counter', async () => {
 jest.useFakeTimers()
 const wallet = {programs:[],rewards:[{id:'reward',programName:'Coffee',label:'Free coffee',expiresAt:null,branchName:null,freeItem:false}],claimsAvailable:true}
 global.fetch = jest.fn().mockResolvedValueOnce({ok:true,json:async()=>wallet})
  .mockResolvedValueOnce({ok:true,json:async()=>({challengeId:'challenge'})})
  .mockResolvedValueOnce({ok:true,json:async()=>({token:'qr',expiresAt:new Date(Date.now()+120000).toISOString()})})
  .mockResolvedValueOnce({ok:true,json:async()=>({...wallet,rewards:[]})})
 render(<LoyaltyWalletPage tenantId="tenant" tenantSlug="shop" storeName="Coffee shop" />)
 fireEvent.change(screen.getByLabelText('Mobile number'),{target:{value:'09171234567'}})
 fireEvent.click(screen.getByRole('button',{name:'Check my rewards'}))
 fireEvent.click(await screen.findByRole('button',{name:'Get QR for Free coffee'}))
 fireEvent.change(await screen.findByLabelText('SMS code'),{target:{value:'123456'}})
 fireEvent.click(screen.getByRole('button',{name:'Verify code'}))
 await screen.findByTestId('claim-qr')
 await act(async () => { jest.advanceTimersByTime(30000) })
 await waitFor(()=>expect(screen.queryByTestId('claim-qr')).not.toBeInTheDocument())
 expect(screen.getByText(/no rewards ready yet/i)).toBeInTheDocument()
})

it('does not display a late wallet response after the tenant changes', async () => {
 let resolveOld!: (value: unknown) => void
 global.fetch = jest.fn().mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve}))
 const {rerender} = render(<LoyaltyWalletPage tenantId="old-tenant" tenantSlug="old-shop" storeName="Old shop" />)
 fireEvent.change(screen.getByLabelText('Mobile number'),{target:{value:'09171234567'}})
 fireEvent.click(screen.getByRole('button',{name:'Check my rewards'}))
 rerender(<LoyaltyWalletPage tenantId="new-tenant" tenantSlug="new-shop" storeName="New shop" />)
 expect(screen.getByLabelText('Mobile number')).toHaveValue('')
 await act(async()=>{resolveOld({ok:true,json:async()=>({programs:[],rewards:[{id:'old',programName:'Old program',label:'Old reward'}],claimsAvailable:true})})})
 expect(screen.queryByText('Old reward')).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:'Check my rewards'})).toBeEnabled()
})

describe('stores that text a code before showing rewards', () => {
 const wallet = {programs:[{id:'program',name:'Coffee',earnMode:'stamp',balance:3,threshold:10,rewardLabel:'Free coffee',status:'active',branchName:null,minSpend:null}],rewards:[],claimsAvailable:true}
 const verifyFirst = {ok:false,status:401,json:async()=>({error:'Verify your number to see your rewards.',reason:'verification_required'})}
 const body = (fetcher: jest.Mock, call: number) => JSON.parse(fetcher.mock.calls[call][1].body)
 beforeEach(() => window.sessionStorage.clear())

 it('texts a code on the first look, then shows the card only after the code is right', async () => {
  const fetcher = jest.fn()
   .mockResolvedValueOnce(verifyFirst)
   .mockResolvedValueOnce({ok:true,json:async()=>({accepted:true,challengeId:'wallet-challenge',expiresInSeconds:300})})
   .mockResolvedValueOnce({ok:true,json:async()=>({sessionToken:'ws1.session',expiresAt:new Date(Date.now()+1800000).toISOString()})})
   .mockResolvedValueOnce({ok:true,json:async()=>wallet})
  global.fetch = fetcher
  render(<LoyaltyWalletPage tenantId="tenant" tenantSlug="shop" storeName="Coffee shop" />)
  fireEvent.change(screen.getByLabelText('Mobile number'),{target:{value:'09171234567'}})
  fireEvent.click(screen.getByRole('button',{name:'Check my rewards'}))
  fireEvent.change(await screen.findByLabelText('SMS code'),{target:{value:'654321'}})
  expect(screen.queryByText(/3 \/ 10 stamps/)).not.toBeInTheDocument()
  expect(fetcher.mock.calls[1][0]).toBe('/api/loyalty/wallet/code')
  fireEvent.click(screen.getByRole('button',{name:'Show my rewards'}))
  expect(await screen.findByText(/3 \/ 10 stamps/)).toBeInTheDocument()
  expect(fetcher.mock.calls[2][0]).toBe('/api/loyalty/wallet/verify')
  expect(body(fetcher,2)).toMatchObject({challengeId:'wallet-challenge',code:'654321',phone:'09171234567'})
  expect(body(fetcher,3)).toMatchObject({sessionToken:'ws1.session'})
  expect(window.sessionStorage.getItem('loyalty-wallet-session:tenant')).toContain('ws1.session')
 })

 it('a reload inside the session goes straight back to the rewards, without a new code', async () => {
  window.sessionStorage.setItem('loyalty-wallet-session:tenant', JSON.stringify({phone:'09171234567',token:'ws1.saved',expiresAt:new Date(Date.now()+600000).toISOString()}))
  const fetcher = jest.fn().mockResolvedValue({ok:true,json:async()=>wallet})
  global.fetch = fetcher
  render(<LoyaltyWalletPage tenantId="tenant" tenantSlug="shop" storeName="Coffee shop" />)
  expect(await screen.findByText(/3 \/ 10 stamps/)).toBeInTheDocument()
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(body(fetcher,0)).toMatchObject({phone:'09171234567',sessionToken:'ws1.saved'})
 })

 it('an expired session on a background refresh hides the card and waits for the customer', async () => {
  window.sessionStorage.setItem('loyalty-wallet-session:tenant', JSON.stringify({phone:'09171234567',token:'ws1.saved',expiresAt:new Date(Date.now()+600000).toISOString()}))
  const fetcher = jest.fn().mockResolvedValueOnce({ok:true,json:async()=>wallet}).mockResolvedValueOnce(verifyFirst)
  global.fetch = fetcher
  render(<LoyaltyWalletPage tenantId="tenant" tenantSlug="shop" storeName="Coffee shop" />)
  await screen.findByText(/3 \/ 10 stamps/)
  fireEvent(window,new Event('focus'))
  expect(await screen.findByRole('button',{name:'Text me a code'})).toBeInTheDocument()
  expect(screen.queryByText(/3 \/ 10 stamps/)).not.toBeInTheDocument()
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(window.sessionStorage.getItem('loyalty-wallet-session:tenant')).toBeNull()
 })

 it('a rate-limited resend says how long to wait and holds the resend button for that long', async () => {
  const rateLimited = {ok:false,status:429,json:async()=>({error:'Too many codes requested for this number. Please wait 7 minutes and try again.',reason:'rate_limited',retryAfterSeconds:412})}
  global.fetch = jest.fn()
   .mockResolvedValueOnce(verifyFirst)
   .mockResolvedValueOnce({ok:true,json:async()=>({accepted:true,challengeId:'wallet-challenge',expiresInSeconds:300})})
   .mockResolvedValueOnce(rateLimited)
  const start = Date.now()
  const clock = jest.spyOn(Date,'now').mockReturnValue(start)
  render(<LoyaltyWalletPage tenantId="tenant" tenantSlug="shop" storeName="Coffee shop" />)
  fireEvent.change(screen.getByLabelText('Mobile number'),{target:{value:'09171234567'}})
  fireEvent.click(screen.getByRole('button',{name:'Check my rewards'}))
  await screen.findByLabelText('SMS code')
  clock.mockReturnValue(start + 61000)
  fireEvent.click(await screen.findByRole('button',{name:'Resend code'}))
  expect(await screen.findByRole('alert')).toHaveTextContent(/wait 7 minutes/i)
  expect(await screen.findByRole('button',{name:/Resend in 4\d\ds/})).toBeDisabled()
  clock.mockRestore()
 })

 it('tells the customer only numbers with stamps get a text', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce(verifyFirst)
   .mockResolvedValueOnce({ok:true,json:async()=>({accepted:true,challengeId:'wallet-challenge',expiresInSeconds:300})})
  render(<LoyaltyWalletPage tenantId="tenant" tenantSlug="shop" storeName="Coffee shop" />)
  fireEvent.change(screen.getByLabelText('Mobile number'),{target:{value:'09171234567'}})
  fireEvent.click(screen.getByRole('button',{name:'Check my rewards'}))
  expect(await screen.findByText(/only numbers that have collected stamps/i)).toBeInTheDocument()
 })

 it('says so plainly when the store cannot text a code', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce(verifyFirst)
   .mockResolvedValueOnce({ok:false,status:503,json:async()=>({error:"This store can't text verification codes right now. Please ask the cashier for help.",reason:'no_sender'})})
  render(<LoyaltyWalletPage tenantId="tenant" tenantSlug="shop" storeName="Coffee shop" />)
  fireEvent.change(screen.getByLabelText('Mobile number'),{target:{value:'09171234567'}})
  fireEvent.click(screen.getByRole('button',{name:'Check my rewards'}))
  expect(await screen.findByRole('alert')).toHaveTextContent(/can't text verification codes/i)
  expect(screen.getByRole('button',{name:'Text me a code'})).toBeEnabled()
 })
})
