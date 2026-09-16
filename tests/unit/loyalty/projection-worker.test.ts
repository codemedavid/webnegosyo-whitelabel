/** @jest-environment node */
jest.mock('server-only',()=>({}))
import type { SupabaseClient } from '@supabase/supabase-js'
import { projectLoyaltyReceipts } from '@/lib/loyalty/projection-worker'
jest.mock('@/lib/customers-service',()=>({createSupabaseCustomerStore:()=>({}),upsertCustomerFromOrder:async()=> 'customer'}))
jest.mock('@/lib/loyalty/store',()=>({createSupabaseLoyaltyDeps:()=>({}),loadLoyaltyTenantFlags:async()=>({isEnabled:false}),loadLoyaltyOrderFact:async()=>({status:'confirmed',phoneE164:'+639171234567',completedAt:null,source:'pos',paymentStatus:'paid',netTotal:50})}))
const id='11111111-1111-4111-8111-111111111111'
it('projects the frozen receipt and only acknowledges after customer reconciliation',async()=>{
 const snapshot={version:1,earningPrograms:[],outletId:null,orderTypeId:id,orderTypeName:'Pickup',items:[{menuItemId:id,name:'Coffee',quantity:1,unitPriceCentavos:10000,baseUnitPriceCentavos:10000,subtotalCentavos:10000,selectedOptions:[]}],
 totals:{subtotalCentavos:10000,discountCentavos:5000,grandTotalCentavos:5000},discount:{label:'₱50 off',loyaltyProgramId:id,amountCentavos:5000},paymentMethods:[{id,name:'Cash'}]}
 const rows:Record<string,unknown>={loyalty_pos_settlements:{id,quote_id:id,cashier_id:id,total_centavos:5000,settled_at:'2026-09-14T00:00:00Z',order_snapshot:snapshot,payment:{methodId:id,kind:'cash',amountTenderedCentavos:10000,changeCentavos:5000,reference:null}},loyalty_pos_quotes:{customer_key:'phone:+639171234567'},tenants:{order_backend:'platform'}}
 const rpc=jest.fn(async(name:string)=>{
  if(name==='claim_loyalty_pos_projections')return {data:[{id:'job',tenant_id:id,settlement_id:id,order_backend:'platform_supabase',lease_token:'lease'}],error:null}
  if(name==='project_loyalty_pos_receipt')return {data:id,error:null}
  return {data:true,error:null}
 })
 const from=(table:string)=>{
  const query:Record<string,unknown>={}
  for(const method of ['select','eq','maybeSingle'])query[method]=()=>query
  query.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:rows[table],error:null}).then(resolve)
  return query
 }
 const outcome=await projectLoyaltyReceipts({from,rpc} as unknown as SupabaseClient)
 expect(outcome).toEqual({completed:1,retried:0,unconfirmed:0})
 expect(rpc).toHaveBeenNthCalledWith(2,'project_loyalty_pos_receipt',expect.objectContaining({p_settlement_id:id,p_receipt:expect.objectContaining({totalCentavos:5000,source:'pos'})}))
 expect(rpc).toHaveBeenNthCalledWith(2,'project_loyalty_pos_receipt',expect.objectContaining({p_receipt:expect.objectContaining({customerData:expect.objectContaining({pos:expect.objectContaining({cashTendered:100,changeDue:50,cashierId:id})})})}))
 expect(rpc).toHaveBeenLastCalledWith('finish_loyalty_pos_projection',expect.objectContaining({p_external_order_id:id,p_lease_token:'lease',p_error:null}))
})
it('leaves failed projection in the durable retry queue without inventing an order ID',async()=>{
 const rpc=jest.fn(async(name:string)=>({data:name==='claim_loyalty_pos_projections'?[{id:'job',tenant_id:id,settlement_id:id,order_backend:'convex',lease_token:'lease'}]:true,error:null}))
 const query:Record<string,unknown>={};for(const method of ['select','eq','maybeSingle'])query[method]=()=>query
 query.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:null,error:{message:'database down'}}).then(resolve)
 const result=await projectLoyaltyReceipts({rpc,from:()=>query} as unknown as SupabaseClient)
 expect(result.retried).toBe(1)
 expect(rpc).toHaveBeenLastCalledWith('finish_loyalty_pos_projection',expect.objectContaining({p_external_order_id:null,p_error:expect.any(String)}))
})
