import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { approvalRequest, FIXTURE_NOW } from "../../lib/approvals/test-fixtures";
import { NeedsReviewCard } from "./NeedsReviewCard";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

describe("NeedsReviewCard", () => {
  it("draws nothing while nothing waits", () => {
    render(<NeedsReviewCard requests={[]} now={FIXTURE_NOW} onReview={jest.fn()} onSeeAll={jest.fn()} />);
    expect(screen.queryByText("Needs your review")).toBeNull();
  });

  it("one request: who is waiting, for what, and a way in", () => {
    const onReview = jest.fn();
    render(<NeedsReviewCard requests={[approvalRequest()]} now={FIXTURE_NOW} onReview={onReview} onSeeAll={jest.fn()} />);
    expect(screen.getByText("Needs your review")).toBeTruthy();
    expect(screen.getByText("Ana is waiting")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Review Refund ₱185 · #14 from Ana" }));
    expect(onReview).toHaveBeenCalledWith("req-1");
  });

  it("several: a count, at most three rows, and See all", () => {
    const onSeeAll = jest.fn();
    const requests = ["a", "b", "c", "d"].map((id, index) =>
      approvalRequest({ id, createdAt: `2026-10-12T04:2${index}:00.000Z`, orderNumber: `#${index + 1}` }),
    );
    render(<NeedsReviewCard requests={requests} now={FIXTURE_NOW} onReview={jest.fn()} onSeeAll={onSeeAll} />);
    expect(screen.getByText("4 requests waiting")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Review / })).toHaveLength(3);
    fireEvent.press(screen.getByRole("button", { name: "See all: Needs your review" }));
    expect(onSeeAll).toHaveBeenCalled();
  });
});
