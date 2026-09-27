import React, { useLayoutEffect as mockUseLayoutEffect } from 'react';
import { AppState, ScrollView, type AppStateStatus } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';
import MemberScreen from '../../app/(main)/loyalty-member/[customerKey]';
import { fetchLoyaltyMember } from '../../lib/loyalty/members-repo';
import type { LoyaltyMemberDetail } from '../../lib/loyalty/members';
let mockTenant = 'store';
let mockCustomerKey = 'phone:+639171234567';
const mockCommittedActions = jest.fn();
jest.mock('../../stores/auth-store', () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({tenantId:mockTenant,orderBackend:null}) }));
jest.mock('expo-router', () => ({router:{push:jest.fn()},useLocalSearchParams:() => ({customerKey:mockCustomerKey})}));
jest.mock('../../lib/loyalty/members-repo', () => ({fetchLoyaltyMember:jest.fn()}));
jest.mock('../BackHeader', () => ({BackHeader:()=>null}));
jest.mock('./MemberRewardsCard', () => ({MemberRewardsCard:()=>null}));
jest.mock('./MemberAdjustCard', () => ({MemberAdjustCard:(props: {tenantId:string;customerKey:string}) => { mockUseLayoutEffect(() => { mockCommittedActions(props); }); return null; }}));
jest.mock('./MemberOrdersCard', () => ({MemberOrdersCard:()=>null}));
jest.mock('./LoyaltyActivityPanel', () => ({LoyaltyActivityPanel:()=>null}));
const fetchMember = jest.mocked(fetchLoyaltyMember);
function detail(name: string): LoyaltyMemberDetail {
 return {member:{customerKey:'phone:+639171234567',customerId:null,name,phone:'+639171234567',email:null,programs:[],headline:null,status:'new',isDormant:false,rewardsAvailable:0,lastActivityAt:null},profile:null,rewards:[],history:[],orders:[],addresses:[]};
}
beforeEach(() => {mockTenant='store';mockCustomerKey='phone:+639171234567';mockCommittedActions.mockClear();fetchMember.mockReset();});
it('refreshes a mounted member when navigation returns to the screen', async () => {
 let focus: () => void = () => {};
 const navigation = {addListener: (_event: string, callback: () => void) => {focus=callback;return () => {};}};
 fetchMember.mockResolvedValueOnce({ok:true,detail:detail('Before sale')}).mockResolvedValueOnce({ok:true,detail:detail('After sale')});
 render(<NavigationContext.Provider value={navigation as never}><MemberScreen /></NavigationContext.Provider>);
 await screen.findByText('Before sale');
 await act(async () => focus());
 expect(await screen.findByText('After sale')).toBeTruthy();
 expect(fetchMember).toHaveBeenCalledTimes(2);
});
it('ignores a member response from the previous store', async () => {
 let resolveOld!: (value: Awaited<ReturnType<typeof fetchLoyaltyMember>>) => void;
 fetchMember.mockImplementationOnce(() => new Promise(resolve => {resolveOld=resolve;})).mockResolvedValueOnce({ok:true,detail:detail('New store member')});
 const view=render(<MemberScreen />);
 mockTenant='new';
 view.rerender(<MemberScreen />);
 await screen.findByText('New store member');
 await act(async () => resolveOld({ok:true,detail:detail('Old store member')}));
 expect(screen.queryByText('Old store member')).toBeNull();
 await waitFor(() => expect(fetchMember).toHaveBeenLastCalledWith('new','phone:+639171234567'));
});

it.each(['tenant', 'customer'])('never commits old member actions under a new %s identity', async kind => {
 fetchMember.mockResolvedValueOnce({ok:true,detail:detail('Old member')}).mockImplementationOnce(() => new Promise(() => {}));
 const view=render(<MemberScreen />);
 await screen.findByText('Old member');
 mockCommittedActions.mockClear();
 if (kind === 'tenant') mockTenant='new';
 else mockCustomerKey='phone:+639189876543';
 view.rerender(<MemberScreen />);
 expect(mockCommittedActions).not.toHaveBeenCalled();
 expect(screen.queryByText('Old member')).toBeNull();
});

it('does not let an old refresh completion end a new identity refresh', async () => {
 let resolveOld!: (value: Awaited<ReturnType<typeof fetchLoyaltyMember>>) => void;
 let resolveNew!: (value: Awaited<ReturnType<typeof fetchLoyaltyMember>>) => void;
 fetchMember.mockResolvedValueOnce({ok:true,detail:detail('Old member')})
  .mockImplementationOnce(() => new Promise(resolve => {resolveOld=resolve;}))
  .mockResolvedValueOnce({ok:true,detail:detail('New member')})
  .mockImplementationOnce(() => new Promise(resolve => {resolveNew=resolve;}));
 const view=render(<MemberScreen />);
 await screen.findByText('Old member');
 let oldRefresh!: Promise<void>;
 act(() => {oldRefresh=screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh();});
 mockTenant='new'; view.rerender(<MemberScreen />);
 await screen.findByText('New member');
 let newRefresh!: Promise<void>;
 act(() => {newRefresh=screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh();});
 expect(screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.refreshing).toBe(true);
 await act(async () => {resolveOld({ok:true,detail:detail('Old member late')});await oldRefresh;});
 expect(screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.refreshing).toBe(true);
 expect(screen.queryByText('Old member late')).toBeNull();
 await act(async () => {resolveNew({ok:true,detail:detail('New member refreshed')});await newRefresh;});
 expect(screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.refreshing).toBe(false);
});

it('ends the pull spinner when a foreground read supersedes the pull request', async () => {
 let foreground: (state: AppStateStatus) => void = () => {};
 const listener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
  foreground = callback;
  return {remove: jest.fn()};
 });
 let resolvePull!: (value: Awaited<ReturnType<typeof fetchLoyaltyMember>>) => void;
 fetchMember.mockResolvedValueOnce({ok:true,detail:detail('Before pull')})
  .mockImplementationOnce(() => new Promise(resolve => {resolvePull=resolve;}))
  .mockResolvedValueOnce({ok:true,detail:detail('Foreground result')});
 try {
  render(<MemberScreen />);
  await screen.findByText('Before pull');
  let pull!: Promise<void>;
  act(() => {pull=screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh();});
  await act(async () => {foreground('active');});
  await screen.findByText('Foreground result');
  await act(async () => {resolvePull({ok:true,detail:detail('Stale pull')});await pull;});
  expect(screen.queryByText('Stale pull')).toBeNull();
  expect(screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.refreshing).toBe(false);
 } finally { listener.mockRestore(); }
});
