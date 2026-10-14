/**
 * "Mark reviewed" — the one write Store Activity has. The server decides who
 * may (full view, reach to the branch, never a non-owner's own row) and is
 * idempotent, so a double tap is harmless. On success every activity read for
 * the store refreshes so the Check chip turns into "Reviewed" everywhere.
 */

import { useCallback, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { invalidateResource } from "../query/use-resource";
import { markActivityReviewed, type ActivityRpcClient } from "./activity-repo";
import { ACTIVITY_FEED_RESOURCE } from "./use-activity-feed";

const ACTIVITY_RESOURCES = [ACTIVITY_FEED_RESOURCE, "store-activity-summary", "store-activity-subject"] as const;

export interface MarkReviewedState {
  mark: (eventId: string) => Promise<boolean>;
  isMarking: boolean;
  error: string | null;
}

export function useMarkReviewed(client: ActivityRpcClient, tenantId: string | null): MarkReviewedState {
  const queryClient = useQueryClient();
  const [isMarking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mark = useCallback(
    async (eventId: string) => {
      setMarking(true);
      setError(null);
      try {
        await markActivityReviewed(client, eventId);
        await Promise.all(ACTIVITY_RESOURCES.map((name) => invalidateResource(queryClient, name, tenantId)));
        AccessibilityInfo.announceForAccessibility("Marked reviewed");
        return true;
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : "Couldn't mark this reviewed. Try again.");
        return false;
      } finally {
        setMarking(false);
      }
    },
    [client, queryClient, tenantId],
  );

  return { mark, isMarking, error };
}
