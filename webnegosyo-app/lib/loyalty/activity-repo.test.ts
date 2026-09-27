import { fetchLoyaltyActivity } from './activity-repo';
import { callLoyaltyApi } from './repo';
jest.mock('./repo', () => ({callLoyaltyApi:jest.fn()}));
const call = jest.mocked(callLoyaltyApi);
beforeEach(() => call.mockReset());
it('encodes the customer and cursor in the authorized tenant request', async () => {
 call.mockResolvedValue({status:200,body:{events:[],nextCursor:'next'}});
 expect(await fetchLoyaltyActivity('store',{customerKey:'phone:+639171234567',kind:'reward_consumed',cursor:'page+2'})).toEqual({events:[],nextCursor:'next'});
 const query = new URLSearchParams(call.mock.calls[0][2].query);
 expect(query.get('customerKey')).toBe('phone:+639171234567');
 expect(query.get('cursor')).toBe('page+2');
 expect(query.get('tenantId')).toBe('store');
});
it('never converts access or transport failures to empty history', async () => {
 call.mockResolvedValueOnce({status:403,body:null}).mockResolvedValueOnce({status:0,body:null});
 await expect(fetchLoyaltyActivity('store')).rejects.toThrow('cannot see');
 await expect(fetchLoyaltyActivity('store')).rejects.toThrow('could not be loaded');
});
