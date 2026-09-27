import { act, fireEvent, render, screen } from '@testing-library/react'
import { LoyaltyMembersPanel } from './loyalty-members-panel'
import { callLoyaltyApi } from '@/lib/loyalty/browser-client'
jest.mock('@/lib/loyalty/browser-client', () => ({callLoyaltyApi:jest.fn()}))
jest.mock('./loyalty-member-detail', () => ({LoyaltyMemberDetailCard: ({detail}: {detail:{member:{name:string}}}) => <p>Detail: {detail.member.name}</p>}))
const api = jest.mocked(callLoyaltyApi)
const member = {customerKey:'phone:+639171234567',name:'Customer',phone:'+639171234567',email:null,headline:null,programs:[],status:'new',rewardsAvailable:0,isDormant:false}
const list = {members:[member],totals:{total:1,rewardReady:0,almostThere:0,dormant:0,earning:0},isTruncated:false}
beforeEach(() => api.mockReset())
it.each(['focus','online'])('refreshes expanded detail on %s', async event => {
 let name='Before sale'
 api.mockImplementation(async (_path, options) => options.query?.customerKey ? {member:{...member,name}} : list)
 render(<LoyaltyMembersPanel tenantId="store" />)
 fireEvent.click(await screen.findByRole('button',{name:/Customer/}))
 await screen.findByText('Detail: Before sale')
 name='After sale'
 await act(async () => { window.dispatchEvent(new Event(event)) })
 expect(await screen.findByText('Detail: After sale')).toBeInTheDocument()
})
it('does not restore a closed member when its refresh completes late', async () => {
 let resolveRefresh!: (value: unknown) => void
 let reads=0
 api.mockImplementation(async (_path,options) => {
  if (!options.query?.customerKey) return list
  if (++reads===1) return {member:{...member,name:'Before sale'}}
  return new Promise(resolve => {resolveRefresh=resolve})
 })
 render(<LoyaltyMembersPanel tenantId="store" />)
 fireEvent.click(await screen.findByRole('button',{name:/Customer/}))
 await screen.findByText('Detail: Before sale')
 await act(async () => {window.dispatchEvent(new Event('focus'))})
 fireEvent.click(await screen.findByRole('button',{name:/Customer/}))
 await act(async () => resolveRefresh({member:{...member,name:'Late detail'}}))
 expect(screen.queryByText('Detail: Late detail')).not.toBeInTheDocument()
})
