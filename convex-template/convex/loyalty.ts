import { allocateDailyOrderNumber } from './orderNumber';
import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';

// Called only with the tenant deploy key by the platform projection worker.
// Order, items and paid state commit in one Convex transaction.
export const projectReceiptInternal = internalMutation({
 args: { settlementId:v.string(), receiptHash:v.string(), receipt:v.any() },
 handler: async(ctx,{settlementId,receiptHash,receipt})=>{
  if(!/^[0-9a-f-]{36}$/.test(settlementId)||!/^[0-9a-f]{64}$/.test(receiptHash)||receipt.source!=='pos'||!Array.isArray(receipt.items)||!receipt.items.length)throw new Error('Invalid canonical receipt');
  const saleOccurredAt = Date.parse(receipt.settledAt);
  if (!Number.isFinite(saleOccurredAt)) throw new Error('Invalid settlement time');
  const clientOrderId=`loyalty:${settlementId}`;
  const existing=await ctx.db.query('orders').withIndex('by_client_order_id',q=>q.eq('clientOrderId',clientOrderId)).first();
  if(existing){
   if(existing.customerData?.loyaltyReceiptHash!==receiptHash)throw new Error('Receipt differs from original projection');
   return existing._id;
  }
  const number = await allocateDailyOrderNumber(ctx, saleOccurredAt);
  const orderId=await ctx.db.insert('orders',{
   ...number,
   saleOccurredAt,
   customerName:'Loyalty customer',customerContact:receipt.phone,
   customerData:{...receipt.customerData,loyaltyReceiptHash:receiptHash},
   total:receipt.totalCentavos/100,source:'pos',status:'confirmed',paymentStatus:'paid',amountPaid:receipt.totalCentavos/100,
   clientOrderId,outletId:receipt.outletId??undefined,orderType:receipt.orderTypeName,orderTypeId:receipt.orderTypeId,
   itemCount:receipt.items.reduce((sum:number,item:{quantity:number})=>sum+item.quantity,0),paymentMethod:receipt.paymentMethodName,
  });
  for(const item of receipt.items)await ctx.db.insert('orderItems',{
   orderId,menuItemId:item.menuItemId,menuItemName:item.name,quantity:item.quantity,
   price:item.unitPriceCentavos/100,subtotal:item.subtotalCentavos/100,variation:item.variation||undefined,
  });
  if(receipt.totalCentavos>0)await ctx.db.insert('orderPayments',{
   occurredAt:saleOccurredAt,
   orderId,kind:'charge',amount:receipt.totalCentavos/100,paymentMethodId:receipt.payment.methodId,paymentMethodName:receipt.paymentMethodName,
   reference:receipt.payment.reference??undefined,recordedBy:receipt.cashierId,outletId:receipt.outletId??undefined,note:'Loyalty POS settlement',
  });
  return orderId;
 },
});

export const refundEvidenceInternal = internalQuery({
 args: { settlementId: v.string() },
 handler: async(ctx,{settlementId})=>{
  const order=await ctx.db.query('orders').withIndex('by_client_order_id',q=>q.eq('clientOrderId',`loyalty:${settlementId}`)).first();
  if(!order)return null;
  const ledger=await ctx.db.query('orderPayments').withIndex('by_order',q=>q.eq('orderId',order._id)).collect();
  return {status:order.status,totalCentavos:Math.round(order.total*100),
   chargedCentavos:ledger.filter(row=>row.kind==='charge').reduce((sum,row)=>sum+Math.round(row.amount*100),0),
   refundedCentavos:ledger.filter(row=>row.kind==='refund').reduce((sum,row)=>sum+Math.round(row.amount*100),0)};
 },
});
