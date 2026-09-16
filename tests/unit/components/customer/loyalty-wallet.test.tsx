import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LoyaltyWalletPage } from '@/components/customer/loyalty-wallet-page'
jest.mock('qrcode.react', () => ({ QRCodeSVG: ({value}:{value:string}) => <div data-testid="claim-qr">{value}</div> }))
it('looks up a phone, selects a reward, verifies a code, and displays its claim QR', async () => {
 const fetcher = jest.fn()
  .mockResolvedValueOnce({ok:true,json:async()=>({programs:[],rewards:[{id:'reward',programName:'Coffee',label:'₱50 off',expiresAt:null,branchName:null,freeItem:false}],claimsAvailable:true})})
  .mockResolvedValueOnce({ok:true,json:async()=>({accepted:true,challengeId:'challenge',expiresInSeconds:300})})
  .mockResolvedValueOnce({ok:true,json:async()=>({token:'opaque-token',expiresAt:new Date(Date.now()+120000).toISOString()})})
 global.fetch=fetcher
 render(<LoyaltyWalletPage tenantId="tenant" tenantSlug="shop" storeName="Coffee shop" />)
 fireEvent.change(screen.getByLabelText('Mobile number'),{target:{value:'09171234567'}})
 fireEvent.click(screen.getByRole('button',{name:'Check my rewards'}))
 fireEvent.click(await screen.findByRole('button',{name:'Claim ₱50 off'}))
 fireEvent.change(await screen.findByLabelText('SMS code'),{target:{value:'123456'}})
 fireEvent.click(screen.getByRole('button',{name:'Verify code'}))
 expect(await screen.findByTestId('claim-qr')).toHaveTextContent('opaque-token')
 expect(fetcher.mock.calls[2][1].body).toContain('"challengeId":"challenge"')
 fireEvent.click(screen.getByRole('button',{name:'Use another number'}))
 expect(screen.queryByTestId('claim-qr')).not.toBeInTheDocument()
 await waitFor(()=>expect(screen.getByLabelText('Mobile number')).toHaveValue(''))
})
