/** @jest-environment node */
jest.mock('server-only',()=>({}))
import type { SupabaseClient } from '@supabase/supabase-js'
import { issueLoyaltyQuote } from '@/lib/loyalty/quote-issuer'
const input={tenantId:'tenant',actor:'actor',claimHash:'hash',requestId:'quote',outletId:'branch',orderTypeId:'pickup',cart:{lines:[{menuItemId:'coffee',quantity:2,selectedOptionIds:[]}]}}
function fixture() {
 const rows:Record<string,unknown>={
  loyalty_verified_claims:{entitlement_id:'reward'},loyalty_entitlements:{id:'reward',terms:{programId:'p',programName:'Coffee',versionNumber:1,isExclusive:true,reward:{type:'free_item',menuItemId:'coffee',itemName:'Coffee'}}},
  tenants:{order_backend:'platform',inventory_enabled:false},menu_items:[{id:'coffee',name:'Coffee',price:100,is_available:true}],
  outlet_menu_items:[{outlet_id:'branch',menu_item_id:'coffee',is_listed:true,is_available:true,price:120,discounted_price:null,discount_cleared:true}],
  order_types:{name:'Pickup',type:'pickup',is_enabled:true,available_on_pos:true,service_charge_enabled:false,pos_markup_percent:null},
  order_type_item_prices:[],payment_methods:[{id:'cash',name:'Cash',require_payment_proof:false}],payment_method_order_types:[{payment_method_id:'cash'}],
 }
 let failedTable=''
 const rpc=jest.fn(async(_name:string,_args:Record<string,unknown>)=>({data:{quoteId:'quote',totalCentavos:12000},error:null}))
 const filters:Record<string,unknown[][]>={}
 const from=jest.fn((table:string)=>{
  filters[table]=[]
  const query:Record<string,unknown>={}
  for(const method of ['select','eq','in','maybeSingle'])query[method]=(...args:unknown[])=>{if(method==='eq')filters[table].push(args);return query}
  query.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:rows[table],error:failedTable===table?{message:'private failure'}:null}).then(resolve)
  return query
 })
 return {rows,rpc,filters,fail:(table:string)=>{failedTable=table},admin:{from,rpc} as unknown as SupabaseClient}
}
it('prices a free base unit from branch catalog prices and freezes a supported payment policy',async()=>{
 const f=fixture()
 const quote=await issueLoyaltyQuote(f.admin,input)
 expect(quote.totals).toEqual({subtotalCentavos:24000,discountCentavos:12000,grandTotalCentavos:12000})
 expect(f.rpc).toHaveBeenCalledWith('issue_loyalty_pos_quote',expect.objectContaining({p_actor:'actor',p_claim_hash:'hash',p_total_centavos:12000,p_snapshot:expect.objectContaining({paymentPolicy:{totalCentavos:12000,allowedMethods:[{id:'cash',kind:'cash',requiresReference:false}]}})}))
 expect(f.filters.menu_items).toContainEqual(['tenant_id','tenant'])
 expect(f.filters.outlet_menu_items).toContainEqual(['outlet_id','branch'])
})
it.each(['outlet_menu_items','menu_items','order_types','payment_methods','order_type_item_prices'])('does not reserve a claim when %s cannot be read',async table=>{
 const f=fixture();f.fail(table)
 await expect(issueLoyaltyQuote(f.admin,input)).rejects.toThrow()
 expect(f.rpc).not.toHaveBeenCalled()
})
it('does not downgrade uploaded-proof requirements to cashier attestation',async()=>{
 const f=fixture();f.rows.payment_methods=[{id:'cash',name:'Cash',require_payment_proof:true}]
 await expect(issueLoyaltyQuote(f.admin,input)).rejects.toThrow('No supported payment method')
 expect(f.rpc).not.toHaveBeenCalled()
})
it('recovers the frozen quote after a lost response even when the catalog is offline',async()=>{
 const f=fixture()
 const original=await issueLoyaltyQuote(f.admin,input)
 const args=f.rpc.mock.calls[0][1]
 f.rows.loyalty_pos_quotes={order_backend:'platform_supabase',total_centavos:12000,order_snapshot:args.p_snapshot}
 f.fail('menu_items')
 const recovered=await issueLoyaltyQuote(f.admin,input)
 expect(recovered).toEqual(original)
})
it('refuses unsupported inventory and service fees before consuming the claim',async()=>{
 const f=fixture();f.rows.tenants={order_backend:'platform',inventory_enabled:true}
 await expect(issueLoyaltyQuote(f.admin,input)).rejects.toThrow('inventory-tracked')
 expect(f.rpc).not.toHaveBeenCalled()
})

it('requires a reference for manual payment rather than silently dropping the POS evidence rule',async()=>{
 const f=fixture();f.rows.payment_methods=[{id:'cash',name:'GCash',require_payment_proof:false}]
 await issueLoyaltyQuote(f.admin,input)
 expect(f.rpc).toHaveBeenCalledWith('issue_loyalty_pos_quote',expect.objectContaining({p_snapshot:expect.objectContaining({paymentPolicy:{totalCentavos:12000,allowedMethods:[{id:'cash',kind:'manual',requiresReference:true}]}})}))
})
