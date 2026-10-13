/**
 * One store activity event with sensible defaults, for the activity tests.
 * Not a test file itself (no `.test.`), so jest never runs it on its own.
 */

import type { StoreActivityEvent } from "./store-event";
import { categoryOfKind, ROUTINE_KINDS, type ActivityKind } from "./taxonomy";

let counter = 0;

export function activityEvent(
  kind: ActivityKind,
  overrides: Partial<StoreActivityEvent> = {},
): StoreActivityEvent {
  counter += 1;
  return {
    id: `e${counter}`,
    outletId: null,
    outletName: null,
    occurredAt: "2026-10-12T04:33:00.000Z",
    category: categoryOfKind(kind),
    kind,
    isRoutine: ROUTINE_KINDS.has(kind),
    actorUserId: "u-ana",
    actorName: "Ana Reyes",
    approvedByName: null,
    amount: null,
    quantity: null,
    unit: null,
    reason: null,
    note: null,
    subjectType: null,
    subjectRef: null,
    orderNumber: null,
    before: null,
    after: null,
    summary: {},
    flags: [],
    reviewedAt: null,
    reviewedByName: null,
    ...overrides,
  };
}
