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
