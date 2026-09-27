import { fireEvent, render, screen } from '@testing-library/react'
import { LoyaltyMemberDetailCard } from './loyalty-member-detail'
import { callLoyaltyApi } from '@/lib/loyalty/browser-client'
import type { LoyaltyMemberDetail } from '@/lib/loyalty/member-repository'
jest.mock('@/lib/loyalty/browser-client', () => ({ callLoyaltyApi: jest.fn() }))
const api = jest.mocked(callLoyaltyApi)
const program = { programId:'p',programName:'Coffee card',programStatus:'active',earnMode:'stamp',threshold:10,rewardLabel:'Free coffee',balance:0,lifetimeEarned:10,rewardsIssued:1,rewardsAvailable:1,lastActivityAt:null,remaining:0,percent:100,isDormant:false } as const
const detail: LoyaltyMemberDetail = { member:{ customerKey:'phone:+639171234567',customerId:null,name:null,phone:'+639171234567',email:null,programs:[program],headline:program,status:'reward_ready',isDormant:false,rewardsAvailable:1,lastActivityAt:null }, profile:null,rewards:[{id:'reward',programId:'p',programName:'Coffee card',label:'Free coffee',status:'issued',issuedAt:null,expiresAt:null,consumedAt:null,resolutionNote:null,isReserved:false}],history:[],orders:[],addresses:[] }
beforeEach(() => api.mockReset())
it('shows ready rewards separately from an empty next card and requires an inline resolution reason', async () => {
 api.mockResolvedValue({})
 const changed = jest.fn()
 render(<LoyaltyMemberDetailCard tenantId="store" detail={detail} onChanged={changed} />)
 expect(screen.getByText('1 reward ready')).toBeInTheDocument()
 expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
 expect(screen.getByText(/Next reward: 10 more visits/)).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button', {name:'They used it'}))
 expect(api).not.toHaveBeenCalled()
 const confirm = screen.getByRole('button', {name:'Confirm used'})
 expect(confirm).toBeDisabled()
 fireEvent.change(screen.getByLabelText('Reward resolution reason'), {target:{value:'Honoured with receipt 42'}})
 fireEvent.click(confirm)
 expect(await screen.findByText('Marked as used.')).toBeInTheDocument()
 expect(api).toHaveBeenCalledWith('/api/loyalty/members', expect.objectContaining({body:{action:'resolve_reward',resolution:{entitlementId:'reward',action:'consume',note:'Honoured with receipt 42'}}}))
 expect(changed).toHaveBeenCalled()
})
it.each(['issued','restored'])('shows an overdue %s reward as expired without a consume action', status => {
 const expiredDetail: LoyaltyMemberDetail = {...detail,member:{...detail.member,status:'earning',rewardsAvailable:0,programs:[{...program,rewardsAvailable:0}]},rewards:[{...detail.rewards[0],status,expiresAt:'2000-01-01T00:00:00Z'}]}
 render(<LoyaltyMemberDetailCard tenantId="store" detail={expiredDetail} onChanged={jest.fn()} />)
 expect(screen.getByText('Expired')).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'They used it'})).not.toBeInTheDocument()
 expect(screen.queryByText('1 reward ready')).not.toBeInTheDocument()
})
