import { callLoyaltyApi } from './repo';
import type { LoyaltyActivityKind, LoyaltyActivityPage } from './activity';

export async function fetchLoyaltyActivity(tenantId: string, options: { kind?: LoyaltyActivityKind | ''; customerKey?: string; cursor?: string } = {}): Promise<LoyaltyActivityPage> {
  const query = new URLSearchParams({ tenantId, limit: '30' });
  for (const [key, value] of Object.entries(options)) if (value) query.set(key, value);
  const result = await callLoyaltyApi('/api/loyalty/activity', 'GET', { tenantId, query: `?${query}` });
  if (result.status === 401 || result.status === 403) throw new Error('Your account cannot see loyalty activity.');
  if (result.status !== 200 || !Array.isArray(result.body?.events)) throw new Error('Activity could not be loaded. Please try again.');
  return { events: result.body.events as LoyaltyActivityPage['events'], nextCursor: typeof result.body.nextCursor === 'string' ? result.body.nextCursor : null };
}
