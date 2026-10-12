/**
 * Cache refreshes for the Tax & discounts screen and the Senior & PWD report,
 * so neither screen imports TanStack itself (`query-layer-wiring.test.ts`).
 */

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateTaxProfile } from "./use-tax-profile";
import { invalidateGovReport } from "./use-gov-report";

export interface TaxSettingsCache {
  /** Every screen reading the store's tax profile — the register first. */
  invalidateProfile: (tenantId: string) => Promise<void>;
  /** Every open Senior & PWD report, any period. */
  invalidateReport: (tenantId: string) => Promise<void>;
}

export function useTaxSettingsCache(): TaxSettingsCache {
  const client = useQueryClient();
  const invalidateProfile = useCallback((tenantId: string) => invalidateTaxProfile(client, tenantId), [client]);
  const invalidateReport = useCallback((tenantId: string) => invalidateGovReport(client, tenantId), [client]);
  return { invalidateProfile, invalidateReport };
}
