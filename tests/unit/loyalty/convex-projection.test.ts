/** @jest-environment node */
jest.mock('../../../convex-template/convex/_generated/server',()=>({internalMutation:(config:unknown)=>config,internalQuery:(config:unknown)=>config}))
import { projectReceiptInternal } from '../../../convex-template/convex/loyalty'
it('replays a canonical receipt without creating another order, item, or payment',async()=>{
 const rows:{table:string;value:Record<string,unknown>}[]=[]
 const db={query:(table:string)=>({withIndex:()=>({first:async()=>rows.find(row=>row.table===table)?.value??null,unique:async()=>rows.find(row=>row.table===table)?.value??null,collect:async()=>rows.filter(row=>row.table===table).map(row=>row.value)})}),insert:async(table:string,value:Record<string,unknown>)=>{const id=String(rows.length+1);rows.push({table,value:{...value,_id:id}});return id}}
 const handler=(projectReceiptInternal as unknown as {handler:(ctx:unknown,args:unknown)=>Promise<string>}).handler
 const args={settlementId:'11111111-1111-4111-8111-111111111111',receiptHash:'a'.repeat(64),receipt:{settledAt:'2026-09-15T15:59:00.000Z',source:'pos',phone:'+639171234567',totalCentavos:5000,customerData:{},payment:{methodId:'cash'},paymentMethodName:'Cash',cashierId:'cashier',orderTypeName:'Pickup',orderTypeId:'pickup',items:[{menuItemId:'coffee',name:'Coffee',quantity:1,unitPriceCentavos:10000,subtotalCentavos:10000}]}}
 expect(await handler({db},args)).toBe('2')
 expect(await handler({db},args)).toBe('2')
 expect(rows.map(row=>row.table)).toEqual(['dailyOrderCounters','orders','orderItems','orderPayments'])
 expect(rows.find(row=>row.table==='orderPayments')?.value).toMatchObject({occurredAt:Date.parse(args.receipt.settledAt)})
 expect(rows[1].value).toMatchObject({paymentStatus:'paid',amountPaid:50,total:50,source:'pos',dailyNumber:1,orderDate:'2026-09-15',saleOccurredAt:Date.parse('2026-09-15T15:59:00.000Z')})
 await expect(handler({db},{...args,receiptHash:'b'.repeat(64)})).rejects.toThrow('differs')
})
