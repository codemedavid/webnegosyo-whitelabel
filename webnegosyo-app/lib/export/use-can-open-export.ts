import { useAuthStore } from "../../stores/auth-store";
import { canOpenExport } from "./export-routes";

/**
 * Whether this account's Export buttons go to the Export screen (files built
 * by the server). False = the screen keeps the export it always had, or shows
 * no button: stores on another order system, the demo, accounts without Reports.
 */
export function useCanOpenExport(): boolean {
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const isDemo = useAuthStore((s) => s.isDemo);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  return canOpenExport({ caller: { role, isOwner, permissions }, isDemo, orderBackend });
}
