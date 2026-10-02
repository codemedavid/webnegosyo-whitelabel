// Pure builder for the AI Growth Coach payload. Turns the numbers the Growth
// screen already computed (summary, bottleneck, margin, customers, products)
// into a compact, PII-free snapshot the edge function wraps in the Hormozi
// prompt. No React, no network — mirrors lib/growth-metrics.ts so the whole
// data-shaping layer stays unit-testable.

import type { GrowthBottleneck } from "./growth-metrics";

/** Slice of GrowthSummary the coach reasons over. */
export interface CoachSummaryInput {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  avgOrdersPerActiveDay: number;
  avgRevenuePerMonth: number;
  activeDays: number;
}

/** Slice of the scale-target math (from computeScaleTarget). */
export interface CoachScaleTargetInput {
  ordersNeededPerDay: number;
  additionalOrdersPerDay: number;
  aovNeededAtCurrentVolume: number;
}

/** Slice of getCustomerInsights — aggregates only, never contacts/PII. */
export interface CoachCustomerInput {
  totalCustomers: number;
  /** 0..1 fraction of customers who ordered more than once. */
  returnRate: number;
  avgRevenuePerCustomer: number;
  walkInOrders?: number;
}

/** Slice of a productAnalytics row — name + revenue drive upsell/bundle advice. */
export interface CoachProductInput {
  name?: string;
  totalRevenue: number;
  marginPercent?: number;
  bcgClassification?: string;
}

/** An AI offer idea from the Offer ideas card (`lib/boost-ai.ts`), already in words. */
export interface CoachOfferIdeaInput {
  kind: "combo" | "upgrade" | "pairing" | "last_call";
  status: "pending" | "approved" | "rejected" | "applied";
  title: string;
  detail: string;
}

export interface CoachFeatureFlags {
  bundlesEnabled?: boolean;
  menuEngineeringEnabled?: boolean;
}

export interface BuildFactsInput {
  periodDays: number;
  targetMonthlyRevenue: number;
  bottleneck: GrowthBottleneck;
  summary: CoachSummaryInput;
  scaleTarget: CoachScaleTargetInput;
  /** Portfolio-weighted margin %, when product costs are set. */
  marginPercent?: number;
  customers?: CoachCustomerInput;
  products?: readonly CoachProductInput[];
  features?: CoachFeatureFlags;
  /** Ideas the AI already drafted from real baskets — the coach points at them, never invents its own. */
  offerIdeas?: readonly CoachOfferIdeaInput[];
}

export interface CoachOfferIdea {
  type: CoachOfferIdeaInput["kind"];
  offer: string;
  /** Already live for customers; otherwise one tap on the Offer ideas card. */
  isLive: boolean;
}

export interface CoachTopProduct {
  name: string;
  revenue: number;
  marginPercent?: number;
}

/** The compact snapshot POSTed to the growth-coach edge function. */
export interface GrowthCoachFacts {
  currency: "PHP";
  periodDays: number;
  targetMonthlyRevenue: number;
  bottleneck: GrowthBottleneck;
  actual: {
    totalRevenue: number;
    totalOrders: number;
    avgOrderValue: number;
    avgOrdersPerActiveDay: number;
    avgRevenuePerMonth: number;
    activeDays: number;
  };
  gapToTarget: {
    /** target − current monthly run-rate; negative once the store is ahead. */
    monthlyRevenueGap: number;
    ordersNeededPerDay: number;
    additionalOrdersPerDay: number;
    aovNeededAtCurrentVolume: number;
  };
  margin?: { portfolioMarginPercent: number };
  customers?: {
    total: number;
    returnRatePercent: number;
    avgRevenuePerCustomer: number;
    walkInOrders?: number;
  };
  topProducts?: CoachTopProduct[];
  offerIdeas?: CoachOfferIdea[];
  features: { bundlesEnabled: boolean; menuEngineeringEnabled: boolean };
  hasData: boolean;
}

const TOP_PRODUCT_LIMIT = 5;
const OFFER_IDEA_LIMIT = 6;
const PESO_SUFFIX_MULTIPLIER: Record<string, number> = { k: 1_000, m: 1_000_000 };

/** Round to a whole number, guarding against NaN/Infinity noise in the prompt. */
function roundPeso(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

/**
 * Parse a merchant-typed monthly target ("500k", "₱500,000", "1.5m") into a
 * positive number of pesos. Returns null for empty, non-numeric, zero, or
 * negative input so the UI can keep the "Get my plan" button disabled.
 */
export function parseTargetRevenue(raw: string): number | null {
  const cleaned = raw.trim().toLowerCase().replace(/[₱,\s]/g, "");
  if (cleaned === "") return null;

  const match = cleaned.match(/^(\d+(?:\.\d+)?)([km])?$/);
  if (!match) return null;

  const [, digits, suffix] = match;
  const base = Number(digits);
  if (!Number.isFinite(base) || base <= 0) return null;

  const multiplier = suffix ? PESO_SUFFIX_MULTIPLIER[suffix] : 1;
  return base * multiplier;
}

/** Top-N products by revenue, named rows only, mapped to the coach shape. */
function topProducts(products: readonly CoachProductInput[]): CoachTopProduct[] {
  return products
    .filter((p) => !!p.name && p.name.trim() !== "" && p.totalRevenue > 0)
    .slice()
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, TOP_PRODUCT_LIMIT)
    .map((p) => ({
      name: p.name as string,
      revenue: roundPeso(p.totalRevenue),
      ...(p.marginPercent !== undefined
        ? { marginPercent: Math.round(p.marginPercent) }
        : {}),
    }));
}

/** Dismissed ideas dropped; the rest as one line each, capped to keep the payload small. */
function offerIdeas(ideas: readonly CoachOfferIdeaInput[]): CoachOfferIdea[] {
  return ideas
    .filter((idea) => idea.status !== "rejected")
    .slice(0, OFFER_IDEA_LIMIT)
    .map((idea) => ({
      type: idea.kind,
      offer: `${idea.title} — ${idea.detail}`,
      isLive: idea.status === "applied",
    }));
}

/** Assemble the PII-free facts snapshot for the AI Growth Coach. */
export function buildGrowthCoachFacts(input: BuildFactsInput): GrowthCoachFacts {
  const { summary, scaleTarget } = input;

  const facts: GrowthCoachFacts = {
    currency: "PHP",
    periodDays: input.periodDays,
    targetMonthlyRevenue: roundPeso(input.targetMonthlyRevenue),
    bottleneck: input.bottleneck,
    actual: {
      totalRevenue: roundPeso(summary.totalRevenue),
      totalOrders: Math.round(summary.totalOrders),
      avgOrderValue: roundPeso(summary.avgOrderValue),
      avgOrdersPerActiveDay: Math.round(summary.avgOrdersPerActiveDay * 10) / 10,
      avgRevenuePerMonth: roundPeso(summary.avgRevenuePerMonth),
      activeDays: Math.round(summary.activeDays),
    },
    gapToTarget: {
      monthlyRevenueGap: roundPeso(
        input.targetMonthlyRevenue - summary.avgRevenuePerMonth,
      ),
      ordersNeededPerDay: Math.round(scaleTarget.ordersNeededPerDay),
      additionalOrdersPerDay: Math.round(scaleTarget.additionalOrdersPerDay),
      aovNeededAtCurrentVolume: roundPeso(scaleTarget.aovNeededAtCurrentVolume),
    },
    features: {
      bundlesEnabled: input.features?.bundlesEnabled ?? false,
      menuEngineeringEnabled: input.features?.menuEngineeringEnabled ?? false,
    },
    hasData: summary.totalOrders > 0,
  };

  if (input.marginPercent !== undefined) {
    facts.margin = { portfolioMarginPercent: Math.round(input.marginPercent) };
  }

  if (input.customers) {
    facts.customers = {
      total: Math.round(input.customers.totalCustomers),
      returnRatePercent: Math.round(input.customers.returnRate * 100),
      avgRevenuePerCustomer: roundPeso(input.customers.avgRevenuePerCustomer),
      ...(input.customers.walkInOrders !== undefined
        ? { walkInOrders: Math.round(input.customers.walkInOrders) }
        : {}),
    };
  }

  const products = topProducts(input.products ?? []);
  if (products.length > 0) {
    facts.topProducts = products;
  }

  const ideas = offerIdeas(input.offerIdeas ?? []);
  if (ideas.length > 0) {
    facts.offerIdeas = ideas;
  }

  return facts;
}
