import { makeFunctionReference } from 'convex/server'

export const getRealtimeQueueRef = makeFunctionReference<'query'>('orders:getRealtimeQueue')
export const getOrdersRef = makeFunctionReference<'query'>('orders:getOrders')
export const getOrderByIdRef = makeFunctionReference<'query'>('orders:getOrderById')
export const updateOrderStatusRef = makeFunctionReference<'mutation'>('orders:updateOrderStatus')
export const createOrderRef = makeFunctionReference<'mutation'>('orders:createOrder')
export const updatePaymentStatusRef =
  makeFunctionReference<'mutation'>('orders:updatePaymentStatus')
