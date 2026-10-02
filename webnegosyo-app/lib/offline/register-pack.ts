/**
 * What the register saves for offline use (`offline-pack.ts` does the saving).
 *
 * Every part is keyed with the SAME key builder its screen reads through, so
 * the download fills the cache and the snapshots the register actually looks
 * at. The menu, the channel prices and the payment methods are required — the
 * register cannot ring a sale without them. Branches and the floor plan are
 * saved when they can be, and never hold the download back.
 */

import { fetchPosCatalog, posCatalogKey, type PosCatalog } from "../query/use-pos-catalog";
import { fetchRegisterPricing, registerPricingKey } from "../query/use-register-pricing";
import { tenderPaymentMethodsKey } from "../query/use-tender-payment-methods";
import { listRegisterPaymentMethods } from "../pos-catalog";
import { OUTLETS_RESOURCE, fetchOutlets } from "../use-outlets";
import { DINING_TABLES_RESOURCE, fetchDiningTables } from "../tables/tables-service";
import { resourceKey } from "../backends/query-keys";
import { POS_TILE_THUMB_PX, thumbUrl } from "../image-thumb";
import type { OfflinePackPart, OfflinePackSummary } from "./offline-pack";

export interface RegisterPackScope {
  /** The store the register's menu, prices, branches and tables belong to. */
  tenantId: string;
  /** The store the tender screen reads methods for (impersonation included). */
  paymentTenantId: string;
  /** The branch the register rings up; null for a store-wide register. */
  outletId: string | null;
}

export function registerPackParts({
  tenantId,
  paymentTenantId,
  outletId,
}: RegisterPackScope): OfflinePackPart[] {
  return [
    {
      label: "menu",
      key: posCatalogKey(tenantId, outletId),
      fetch: () => fetchPosCatalog(tenantId, outletId),
      isRequired: true,
    },
    {
      label: "prices",
      key: registerPricingKey(tenantId),
      fetch: () => fetchRegisterPricing(tenantId),
      isRequired: true,
    },
    {
      label: "payment methods",
      key: tenderPaymentMethodsKey(paymentTenantId),
      fetch: () => listRegisterPaymentMethods(paymentTenantId),
      isRequired: true,
    },
    {
      label: "branches",
      key: resourceKey(OUTLETS_RESOURCE, tenantId),
      fetch: () => fetchOutlets(tenantId),
      isRequired: false,
    },
    {
      label: "tables",
      key: resourceKey(DINING_TABLES_RESOURCE, tenantId),
      fetch: () => fetchDiningTables(tenantId),
      isRequired: false,
    },
  ];
}

function countOf(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

export function summarizeRegisterPack(values: ReadonlyMap<string, unknown>): OfflinePackSummary {
  const menu = values.get("menu") as Partial<PosCatalog> | undefined;
  const prices = values.get("prices") as { orderTypes?: unknown } | undefined;
  return {
    items: countOf(menu?.items),
    orderTypes: countOf(prices?.orderTypes),
    paymentMethods: countOf(values.get("payment methods")),
  };
}

/**
 * The thumbnail URLs the register grid draws for this menu, de-duplicated, so
 * the download can put the photos in the image cache too. Tolerant of any
 * value: it reads what the download fetched, not a typed contract.
 */
export function registerPackThumbnails(menu: unknown): string[] {
  const items = (menu as { items?: unknown } | undefined)?.items;
  if (!Array.isArray(items)) return [];
  const urls = items
    .map((item) => thumbUrl((item as { product?: { image_url?: string | null } })?.product?.image_url, POS_TILE_THUMB_PX))
    .filter((url): url is string => url !== null);
  return [...new Set(urls)];
}
