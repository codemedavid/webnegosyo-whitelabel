"use client";

import { useAction } from "convex/react";
import type { FunctionReference } from "convex/server";

/**
 * The per-tenant deployment's Lalamove actions. String references, like the
 * order hooks: the main app has no generated Convex API for tenant backends.
 * Return shapes mirror convex-template/convex/lalamove.ts.
 */
export interface ConvexLalamoveResult {
  success: boolean;
  error?: string;
  lalamoveOrderId?: string;
  quotationId?: string;
  price?: string;
  status?: string;
  recipientPhoneSource?: "customer" | "store";
}

type OrderAction = FunctionReference<"action", "public", { orderId: string }, ConvexLalamoveResult>;
type PriorityFeeAction = FunctionReference<
  "action",
  "public",
  { orderId: string; amount: string },
  ConvexLalamoveResult
>;

const bookRef = "lalamove:bookLalamove" as unknown as OrderAction;
const requoteRef = "lalamove:requoteLalamove" as unknown as OrderAction;
const cancelRef = "lalamove:cancelLalamove" as unknown as OrderAction;
const syncRef = "lalamove:syncLalamoveStatus" as unknown as OrderAction;
const priorityFeeRef = "lalamove:addLalamovePriorityFee" as unknown as PriorityFeeAction;

export function useConvexLalamoveActions() {
  return {
    book: useAction(bookRef),
    requote: useAction(requoteRef),
    cancel: useAction(cancelRef),
    sync: useAction(syncRef),
    addPriorityFee: useAction(priorityFeeRef),
  };
}
