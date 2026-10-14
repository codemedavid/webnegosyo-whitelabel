import React from "react";
import { render, screen } from "@testing-library/react-native";

import { activityEvent } from "../../lib/activity/test-fixtures";
import type { ActivityFeedResult } from "../../lib/activity/use-activity-feed";
import { ActivityFeedPanel, type FeedEmptyVariant } from "./ActivityFeedPanel";

const NOW = "2026-10-12T04:41:00.000Z";

function feed(partial: Partial<ActivityFeedResult> = {}): ActivityFeedResult {
  return {
    events: [],
    isLoading: false,
    error: null,
    isUnavailable: false,
    isShowingStale: false,
    isRefetching: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(async () => undefined),
    dataUpdatedAt: Date.parse("2026-10-12T04:41:00.000Z"),
    ...partial,
  };
}

function renderPanel(result: ActivityFeedResult, options: { emptyVariant?: FeedEmptyVariant; isOffline?: boolean; isFullViewer?: boolean } = {}) {
  render(
    <ActivityFeedPanel
      feed={result}
      nowIso={NOW}
      isOffline={options.isOffline ?? false}
      isFullViewer={options.isFullViewer ?? true}
      showBranch={false}
      canReviewRows
      emptyVariant={options.emptyVariant ?? "quiet"}
      onClearFilters={jest.fn()}
      onOpenEvent={jest.fn()}
      onMarkReviewed={jest.fn()}
    />,
  );
}

describe("ActivityFeedPanel", () => {
  it("shows placeholder rows, not a spinner, on the first load", () => {
    renderPanel(feed({ isLoading: true }));
    expect(screen.getByLabelText("Loading activity")).toBeTruthy();
  });

  it("keeps the rows it had and says how old they are when a refresh fails", () => {
    renderPanel(feed({ events: [activityEvent("stock.received", { occurredAt: NOW })], isShowingStale: true, error: "Network" }));
    expect(screen.getByText("Couldn't refresh. Showing what we had at 12:41 PM.")).toBeTruthy();
    expect(screen.getByText(/received/)).toBeTruthy();
  });

  it("says the phone is offline instead of offering a retry that cannot work", () => {
    renderPanel(feed({ events: [activityEvent("stock.received", { occurredAt: NOW })] }), { isOffline: true });
    expect(screen.getByText("You're offline. Showing activity up to 12:41 PM.")).toBeTruthy();
    expect(screen.queryByText("Try again")).toBeNull();
  });

  it("errors only when there is nothing to show", () => {
    renderPanel(feed({ error: "Network" }));
    expect(screen.getByText("Couldn't load activity")).toBeTruthy();
  });

  it("puts the Owl only on the all-clear state", () => {
    renderPanel(feed(), { emptyVariant: "all_clear" });
    expect(screen.getByText("All clear. Nothing needs a look.")).toBeTruthy();
  });

  it("offers the way out when filters matched nothing", () => {
    renderPanel(feed(), { emptyVariant: "filtered" });
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeTruthy();
  });

  it("tells a staff member they are seeing their own activity", () => {
    renderPanel(feed({ events: [activityEvent("stock.received", { occurredAt: NOW })] }), { isFullViewer: false });
    expect(screen.getByText("You're seeing your own activity.")).toBeTruthy();
  });
});
