import {readPendingLoyaltySale,savePendingLoyaltySale,callLoyaltyPos,newLoyaltyRequestId} from './pos-api';
const mockStorage=new Map<string,string>();
jest.mock('@react-native-async-storage/async-storage',()=>({__esModule:true,default:{getItem:async(key:string)=>mockStorage.get(key)??null,setItem:async(key:string,value:string)=>{mockStorage.set(key,value)},removeItem:async(key:string)=>{mockStorage.delete(key)}}}));
jest.mock('expo-constants',()=>({__esModule:true,default:{expoConfig:{extra:{}}}}));
jest.mock('../supabase',()=>({supabase:{auth:{getSession:async()=>({data:{session:{access_token:'session'}}})}}}));
jest.mock('../web-app-url',()=>({getWebAppUrl:()=> 'https://store.test'}));
it('keeps the exact pending tender scoped to its tenant and cashier across retries',async()=>{
 const sale={quoteId:'q',clientOrderId:newLoyaltyRequestId(),tender:{methodId:'cash',amountTenderedCentavos:5000}};
 await savePendingLoyaltySale('tenant','cashier',sale);
 expect(await readPendingLoyaltySale('tenant','cashier')).toEqual(sale);
 expect(await readPendingLoyaltySale('tenant','other')).toBeNull();
 expect(await readPendingLoyaltySale('other','cashier')).toBeNull();
 const fetcher=jest.fn().mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce({ok:true,json:async()=>({receipt:{settlementId:'original',totalCentavos:5000}})});
 global.fetch=fetcher;
 await expect(callLoyaltyPos('settlements',{tenantId:'tenant',...sale})).rejects.toThrow('lost response');
 const retry=await readPendingLoyaltySale('tenant','cashier');
 await callLoyaltyPos('settlements',{tenantId:'tenant',...retry});
 expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body);
 await savePendingLoyaltySale('tenant','cashier',null);
 expect(await readPendingLoyaltySale('tenant','cashier')).toBeNull();
});

it('refuses an unconfirmed receipt response so the checkout keeps its recovery journal',async()=>{
 global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({success:true})});
 await expect(callLoyaltyPos('settlements',{})).rejects.toThrow('Receipt could not be confirmed');
});
