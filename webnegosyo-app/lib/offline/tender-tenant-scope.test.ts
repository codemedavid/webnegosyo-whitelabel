/**
 * The register must stamp a queued sale with the SAME store the replay looks
 * for. `useOutboxSync` and the pending-sale banner both scope to
 * `impersonatedTenantId ?? tenantId`; a tender screen reading the raw
 * `tenantId` would stamp a superadmin's impersonated sale with their own
 * store — so it would never replay and never be counted — and would refuse
 * the sale outright for a superadmin, whose own `tenant_id` is NULL.
 *
 * There is no runtime seam to assert this on: the scope is read straight off
 * the store inside the screen component. So the invariant is pinned where it
 * lives.
 */
import { readFileSync } from "fs";
import { join } from "path";

const read = (path: string) => readFileSync(join(__dirname, "..", "..", path), "utf8");

const IMPERSONATION_AWARE = /impersonatedTenantId\s*\?\?\s*(?:s|state)\.tenantId/;

it("stamps a queued sale with the impersonation-aware store", () => {
  expect(read("app/(main)/pos-tender.tsx")).toMatch(IMPERSONATION_AWARE);
});

it("replays and counts against that same store", () => {
  expect(read("lib/offline/use-outbox-sync.ts")).toMatch(IMPERSONATION_AWARE);
});
