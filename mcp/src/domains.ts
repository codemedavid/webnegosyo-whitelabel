import path from "node:path";

export type DomainKey =
  | "ui"
  | "functions"
  | "tenants"
  | "admin"
  | "superadmin"
  | "api";

export const DOMAIN_ROOTS: Record<DomainKey, string[]> = {
  ui: ["src/app", "src/components"],
  functions: ["src/actions", "src/lib"],
  tenants: ["src/app/[tenant]", "src/components/customer"],
  admin: ["src/app/[tenant]/admin", "src/components/admin"],
  superadmin: ["src/app/superadmin", "src/components/superadmin"],
  api: ["src/app/api"]
};

export const DOMAIN_DESCRIPTIONS: Record<DomainKey, string> = {
  ui: "Routes and shared UI components.",
  functions: "Server actions, data access, and shared libraries.",
  tenants: "Tenant-facing routes and customer UI.",
  admin: "Tenant admin routes and admin UI.",
  superadmin: "Superadmin routes and UI.",
  api: "API route handlers."
};

export function resolveRepoRoot(currentFileUrl: string): string {
  const here = path.dirname(new URL(currentFileUrl).pathname);
  return path.resolve(here, "..", "..");
}

export function resolveDomainRoots(repoRoot: string, domain: DomainKey): string[] {
  return DOMAIN_ROOTS[domain].map((rel) => path.resolve(repoRoot, rel));
}
