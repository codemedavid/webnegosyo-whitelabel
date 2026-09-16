import type { FunctionReference } from 'convex/server';
import { renderHook } from '@testing-library/react-native';
import { useSafeQuery } from './hooks';
import { usePlatformQuery } from './backends/use-platform-query';
import { useQuery } from 'convex/react';

let mockSelectedOutletId = 'north';
let mockBackend = 'platform';
jest.mock('../stores/auth-store', () => ({ useAuthStore: (select: (state: { tenantId: string; orderBackend: string; convexUrl: string; convexSchemaVersion: number }) => unknown) => select({
  tenantId: 'tenant', orderBackend: mockBackend, convexUrl: 'https://example.convex.cloud', convexSchemaVersion: 30,
}) }));
jest.mock('./use-branch-scope', () => ({
  useAccountBranchScope: () => ({ kind: 'all' }),
  useBranchScope: () => ({ kind: 'branch', outletId: mockSelectedOutletId }),
}));
jest.mock('./backends/use-platform-query', () => ({ usePlatformQuery: jest.fn(() => ({})), platformClient: {} }));
jest.mock('convex/react', () => ({ useQuery: jest.fn(), useMutation: jest.fn(), useAction: jest.fn() }));
jest.mock('./customers/lifecycle', () => ({ notifyLifecycleSync: jest.fn() }));

beforeEach(() => { jest.clearAllMocks(); mockSelectedOutletId = 'north'; mockBackend = 'platform'; });

it('asks Supabase for the selected branch totals and changes scope when the owner switches', () => {
  const { rerender } = renderHook(() => useSafeQuery('analytics:getSalesAnalytics' as unknown as FunctionReference<"query">, { daysBack: 7 }));
  expect(usePlatformQuery).toHaveBeenLastCalledWith('analytics:getSalesAnalytics', { daysBack: 7 }, 'tenant', { kind: 'branch', outletId: 'north' });
  mockSelectedOutletId = 'south';
  rerender({});
  expect(usePlatformQuery).toHaveBeenLastCalledWith('analytics:getSalesAnalytics', { daysBack: 7 }, 'tenant', { kind: 'branch', outletId: 'south' });
});

it('keeps portfolio raw order reads at account scope', () => {
  renderHook(() => useSafeQuery('orders:getOrders' as unknown as FunctionReference<"query">, {}));
  expect(usePlatformQuery).toHaveBeenLastCalledWith('orders:getOrders', {}, 'tenant', { kind: 'all' });
});

it('asks Convex for the selected branch totals', () => {
  mockBackend = 'convex';
  renderHook(() => useSafeQuery('analytics:getSalesAnalytics' as unknown as FunctionReference<"query">, { daysBack: 7 }));
  expect(useQuery).toHaveBeenLastCalledWith('analytics:getSalesAnalytics', { daysBack: 7, outletId: 'north' });
});

it('uses the selected branch for daily report revenue', () => {
  renderHook(() => useSafeQuery('orders:getDashboardStatsByPeriod' as unknown as FunctionReference<"query">, { startDate: 1, endDate: 2 }));
  expect(usePlatformQuery).toHaveBeenLastCalledWith('orders:getDashboardStatsByPeriod', { startDate: 1, endDate: 2 }, 'tenant', { kind: 'branch', outletId: 'north' });
});
