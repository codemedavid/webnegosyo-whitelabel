"use client";

import { useQuery, useMutation } from "convex/react";
import { FunctionReference } from "convex/server";

// Type-safe wrappers for Convex queries (since we don't have generated types in the main app)
const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;
const getRealtimeQueueRef = "orders:getRealtimeQueue" as unknown as FunctionReference<"query">;
const getDashboardStatsRef = "orders:getDashboardStats" as unknown as FunctionReference<"query">;
const getOrderByIdRef = "orders:getOrderById" as unknown as FunctionReference<"query">;
const updateOrderStatusRef = "orders:updateOrderStatus" as unknown as FunctionReference<"mutation">;

export function useConvexOrders(status?: string) {
  const args = status ? { status } : {};
  return useQuery(getOrdersRef, args);
}

export function useConvexOrderQueue() {
  return useQuery(getRealtimeQueueRef);
}

export function useConvexDashboardStats() {
  return useQuery(getDashboardStatsRef);
}

export function useConvexOrderById(orderId: string) {
  return useQuery(getOrderByIdRef, { orderId });
}

export function useUpdateConvexOrderStatus() {
  return useMutation(updateOrderStatusRef);
}
