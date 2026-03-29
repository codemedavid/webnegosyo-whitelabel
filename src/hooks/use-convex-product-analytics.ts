"use client";

import { useQuery, useMutation } from "convex/react";
import { FunctionReference } from "convex/server";

// String-based function references (same pattern as use-convex-orders.ts)
const getCostRef = "productCosts:getCost" as unknown as FunctionReference<"query">;
const setCostRef = "productCosts:setCost" as unknown as FunctionReference<"mutation">;
const getAllCostsRef = "productCosts:getAllCosts" as unknown as FunctionReference<"query">;
const getAllAnalyticsRef = "productAnalytics:getAll" as unknown as FunctionReference<"query">;
const getByItemRef = "productAnalytics:getByItem" as unknown as FunctionReference<"query">;
const getPortfolioSummaryRef = "productAnalytics:getPortfolioSummary" as unknown as FunctionReference<"query">;

export function useProductCost(menuItemId: string) {
  return useQuery(getCostRef, { menuItemId });
}

export function useSetProductCost() {
  return useMutation(setCostRef);
}

export function useAllProductCosts() {
  return useQuery(getAllCostsRef);
}

export function useProductAnalytics(period?: string) {
  return useQuery(getAllAnalyticsRef, { period: period ?? "30d" });
}

export function useProductAnalyticsByItem(menuItemId: string, period?: string) {
  return useQuery(getByItemRef, { menuItemId, period: period ?? "30d" });
}

export function usePortfolioSummary(period?: string) {
  return useQuery(getPortfolioSummaryRef, { period: period ?? "30d" });
}
