import { resolveRegisterOutlet } from './register-outlet';

it('uses the owner selected branch instead of their account default', () => {
  expect(resolveRegisterOutlet({ isOwner: true, outletId: 'north', outletName: 'North' }, {
    selectedOutletId: 'south', selectedOutletName: 'South', knownOutletIds: ['north', 'south'],
  })).toEqual({ id: 'south', name: 'South' });
});
it('keeps branch staff at their assigned branch', () => {
  expect(resolveRegisterOutlet({ isOwner: false, outletId: 'north', outletName: 'North' }, {
    selectedOutletId: 'south', selectedOutletName: 'South', knownOutletIds: ['north', 'south'],
  })).toEqual({ id: 'north', name: 'North' });
});
it('never guesses a branch for an owner in all-branches mode', () => {
  expect(resolveRegisterOutlet({ isOwner: true, outletId: 'north' }, {
    selectedOutletId: null, selectedOutletName: null, knownOutletIds: ['north', 'south'],
  })).toBeNull();
});

import { useAuthStore } from '../stores/auth-store';
import { useBranchContextStore } from '../stores/branch-context-store';
import { usePosCartStore } from '../stores/pos-cart-store';

it('holds the branch that priced the cart even if the owner changes branches before paying', () => {
  useAuthStore.setState({ isOwner: true, outletId: 'north', isSuperadmin: false, isDemo: false });
  useBranchContextStore.getState().setKnownOutlets([{ id: 'north' }, { id: 'south' }]);
  useBranchContextStore.getState().selectBranch('south', 'South');
  usePosCartStore.getState().reset();
  usePosCartStore.getState().add({ menuItemId: 'coffee', name: 'Coffee', basePrice: 100, quantity: 1, selections: [] });
  useBranchContextStore.getState().selectBranch('north', 'North');
  expect(usePosCartStore.getState().saleOutlet).toEqual({ id: 'south', name: 'South' });
});

it('refuses to mix another branch catalog into an existing sale', () => {
  useBranchContextStore.getState().selectBranch('south', 'South');
  usePosCartStore.getState().reset();
  const item = { menuItemId: 'coffee', name: 'Coffee', basePrice: 100, quantity: 1, selections: [] };
  usePosCartStore.getState().add(item);
  useBranchContextStore.getState().selectBranch('north', 'North');
  expect(() => usePosCartStore.getState().add(item)).toThrow(/Branch changed/);
  expect(usePosCartStore.getState().lines[0].quantity).toBe(1);
});
