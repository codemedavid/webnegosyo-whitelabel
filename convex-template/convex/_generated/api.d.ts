/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analytics from "../analytics.js";
import type * as config from "../config.js";
import type * as crons from "../crons.js";
import type * as lalamove from "../lalamove.js";
import type * as notifications from "../notifications.js";
import type * as orders from "../orders.js";
import type * as productAnalytics from "../productAnalytics.js";
import type * as productAnalyticsAggregator from "../productAnalyticsAggregator.js";
import type * as productCosts from "../productCosts.js";
import type * as statsAggregator from "../statsAggregator.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analytics: typeof analytics;
  config: typeof config;
  crons: typeof crons;
  lalamove: typeof lalamove;
  notifications: typeof notifications;
  orders: typeof orders;
  productAnalytics: typeof productAnalytics;
  productAnalyticsAggregator: typeof productAnalyticsAggregator;
  productCosts: typeof productCosts;
  statsAggregator: typeof statsAggregator;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
