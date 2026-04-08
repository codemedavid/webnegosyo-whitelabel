"use client";

import { useQuery, useMutation } from "convex/react";
import { FunctionReference } from "convex/server";

// Type-safe wrappers for Convex queries (since we don't have generated types in the main app)
const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;
const getRealtimeQueueRef = "orders:getRealtimeQueue" as unknown as FunctionReference<"query">;
const getDashboardStatsRef = "orders:getDashboardStats" as unknown as FunctionReference<"query">;
const getOrderByIdRef = "orders:getOrderById" as unknown as FunctionReference<"query">;
const updateOrderStatusRef = "orders:updateOrderStatus" as unknown as FunctionReference<"mutation">;
const getDashboardStatsByPeriodRef = "orders:getDashboardStatsByPeriod" as unknown as FunctionReference<"query">;
const getSalesAnalyticsRef = "analytics:getSalesAnalytics" as unknown as FunctionReference<"query">;
const getPaymentMethodAnalyticsRef = "analytics:getPaymentMethodAnalytics" as unknown as FunctionReference<"query">;
const getOrderHeatmapRef = "analytics:getOrderHeatmap" as unknown as FunctionReference<"query">;
const getCustomerInsightsRef = "analytics:getCustomerInsights" as unknown as FunctionReference<"query">;
const getUpsellAnalyticsRef = "analytics:getUpsellAnalytics" as unknown as FunctionReference<"query">;
const getBundleAnalyticsRef = "analytics:getBundleAnalytics" as unknown as FunctionReference<"query">;
const getTopItemsRef = "analytics:getTopItems" as unknown as FunctionReference<"query">;
const getTrendsRef = "analytics:getTrends" as unknown as FunctionReference<"query">;
const getRevenueBreakdownRef = "analytics:getRevenueBreakdown" as unknown as FunctionReference<"query">;
const getUpsellTrendsRef = "analytics:getUpsellTrends" as unknown as FunctionReference<"query">;
const updatePaymentStatusRef = "orders:updatePaymentStatus" as unknown as FunctionReference<"mutation">;

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

export function useConvexOrderById(orderId: string | null) {
  return useQuery(getOrderByIdRef, orderId ? { orderId } : "skip");
}

export function useUpdateConvexOrderStatus() {
  return useMutation(updateOrderStatusRef);
}

export function useConvexDashboardStatsByPeriod(startDate: number, endDate: number) {
  return useQuery(getDashboardStatsByPeriodRef, { startDate, endDate });
}

export function useConvexSalesAnalytics(daysBack: number) {
  return useQuery(getSalesAnalyticsRef, { daysBack });
}

export function useConvexPaymentMethodAnalytics(daysBack: number) {
  return useQuery(getPaymentMethodAnalyticsRef, { daysBack });
}

export function useConvexOrderHeatmap(daysBack: number) {
  return useQuery(getOrderHeatmapRef, { daysBack });
}

export function useConvexCustomerInsights(daysBack: number) {
  return useQuery(getCustomerInsightsRef, { daysBack });
}

export function useConvexUpsellAnalytics(daysBack: number) {
  return useQuery(getUpsellAnalyticsRef, { daysBack });
}

export function useConvexBundleAnalytics(daysBack: number) {
  return useQuery(getBundleAnalyticsRef, { daysBack });
}

export function useConvexTopItems(daysBack: number, limit?: number) {
  return useQuery(getTopItemsRef, { daysBack, limit });
}

export function useConvexTrends(daysBack: number) {
  return useQuery(getTrendsRef, { daysBack });
}

export function useConvexRevenueBreakdown(daysBack: number) {
  return useQuery(getRevenueBreakdownRef, { daysBack });
}

export function useConvexUpsellTrends(daysBack: number) {
  return useQuery(getUpsellTrendsRef, { daysBack });
}

export function useUpdateConvexPaymentStatus() {
  return useMutation(updatePaymentStatusRef);
}
