import React from "react";

import { useConnectivity } from "../../lib/offline/use-connectivity";
import { ApprovalsInbox } from "../approvals/ApprovalsInbox";

export interface ApprovalsInboxSlotProps {
  tenantId: string | null;
  /**
   * Reports how many requests wait, so the Activity screen can open on
   * "To review" while anything is pending (spec §3.1).
   */
  onPendingCountChange?: (count: number) => void;
}

/**
 * The "To review" tab's content: the approvals inbox (Phase 3). Kept under
 * its Phase 2 name and props so app/(main)/activity.tsx mounts it unchanged.
 * Shown to approvers only.
 */
export function ApprovalsInboxSlot({ tenantId, onPendingCountChange }: ApprovalsInboxSlotProps) {
  const { status } = useConnectivity();
  if (!tenantId) return null;
  return <ApprovalsInbox tenantId={tenantId} isOffline={status === "offline"} onPendingCountChange={onPendingCountChange} />;
}
