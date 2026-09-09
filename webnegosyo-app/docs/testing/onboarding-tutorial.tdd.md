# TDD evidence — in-app onboarding tutorial

## Source plan

No `*.plan.md` was supplied. Derived from the request: "create an onboarding tutorial
on our webnegosyo-app … shows them exactly how to use the app … shows what it looks like
when they did something … make the UI/UX extremely good."

## User journey

As a merchant opening the app for the first time, I want a short guided tour of every
screen I can use — with examples I can tap and see react — so I can run my store from
the app without reading a manual, and come back to any chapter later.

## Task report

**Shape.** A chapter registry (`lib/tutorial/chapters.ts`, 11 chapters / 31 steps) drives
two screens: a hub (`app/(main)/tutorial/index.tsx`) with a progress ring and a
"Continue" that resumes the first unfinished chapter, and a player
(`app/(main)/tutorial/[chapterId].tsx`) that plays each step **full screen**: the real
screen, simulated from the app's own components (`OrderCard`, `StatusPipeline`,
`HeroRevenueCard`, `OrderFilterBar`, `TicketCard`, `ProductTile`, `CartSheet`,
`SwipeToComplete`, `InventoryStockCard`, `ScreenHeader`, `BackHeader`…) and fed with one
consistent day of mock trade (`lib/tutorial/mock-data.ts`), set in the merchant's own
store name. A spotlight overlay (`components/tutorial/spotlight.tsx`) dims everything
but the control the step is about — four opaque panels around a measured hole, so
touches reach only the target — and a floating ink coach card carries the words,
progress, back and next. Doing the step lifts the dim so the "after" state is seen
whole. The real tab bar is hidden under the chapter route; each scene draws the same
bar so the simulation reads as the app.

The scenes (`components/tutorial/scenes/*`) follow one order from chime to hand-over:
it arrives on Home on its own, is confirmed on Orders, walked to Delivered on the
detail screen, cooked on the Kitchen board, and the same items are rung up at the
register and paid for with a real swipe. Alerts and sheets are drawn in-scene
(`MockAlert`, `MockSheet`) so the spotlight can target them too.

**First run.** `TutorialWelcomePopup`, mounted once beside `WhatsNewPopup`, greets a
merchant whose progress record has never been touched. Superadmins are never greeted,
even while viewing a store. Declining or starting both stamp `welcomeSeen`.

**Who sees what.** `visibleChapters` runs each chapter's `gateTab` through
`isTabReachable` — the same four gates the tab bar applies — so a cashier is not
taught Team, a single-location store is not taught Branches, and the demo store gets
the full owner tour.

**Persistence.** `stores/tutorial-store.ts` keeps one record per signed-in user
(`tutorial_progress:<userId>`; every demo session shares `tutorial_progress:demo`) in
AsyncStorage. Set first, persist second; corrupt records start a fresh tour.

**Navigation hazards honoured.** Every in-tab move uses `goTo` (navigate, never
replace — see `lib/tab-navigation.ts`), and the player resets its step on focus and on
chapter change because tab screens stay mounted.

**Entry points.** Menu hub → Tools → "Learn the app" (with live progress in the
subtitle); Account → "Learn the app"; the greeter.

## Validation commands actually run

RED (registry test before any illustration existed):

```
$ npx jest lib/tutorial/chapters
    ✕ only names illustrations that are drawn
Tests:       1 failed, 5 passed, 6 total
```

GREEN (after the eleven demos and the registry):

```
$ npx jest lib/tutorial/chapters
Tests:       6 passed, 6 total
```

Full tutorial surface (logic + store + rendered scenes + wiring guardrails), after the
full-screen rebuild:

```
$ npx jest components/tutorial lib/tutorial stores/tutorial-store
Tests:       51 passed, 51 total
$ npx tsc --noEmit -p .            # clean
$ npx expo lint                     # 0 warnings in tutorial files
```

Rendered-scene tests drive the real components: `OrdersScene` confirms through the
real `OrderCard` button and raises the print offer, `TenderScene` computes ₱175 change
from ₱500 on a ₱325 bill and refuses a short amount, `HomeScene` lets the order arrive
on a timer and opens it on tap, and the view chip switches the bar to Register.

House-style guardrail (`lib/screen-primitives.test.ts`) passes for both tutorial
screens. Pre-existing failures in that suite (analytics, branch-menu, daily-report,
dashboard, growth, inventory, …) and in `lib/platform-backend-gates.test.ts` (a
`login.tsx` edit from another session) were present before this work and are untouched.

## Not done / needs a device

- No simulator run in this session: the spotlight's measured cut-out
  (`measureInWindow` on a 400 ms re-measure while active), the pulsing ring, the
  order's slide-in, the ticket "bump" fly-out and the real `SwipeToComplete` gesture
  were verified by type-check and render tests only. The cut-out's coordinates
  assume the chapter route fills the window (it does: header and tab bar hidden).
- Ships with the next EAS build or OTA update; nothing server-side changed.

## Device finding — spotlight render loop (fixed)

On device the chapter threw "Maximum update depth exceeded" from `spotlight.tsx`.
Cause: the context value was rebuilt whenever a frame was stored, which rebuilt the
target's `measure` callback, which re-ran the effect whose cleanup cleared the frame.
Fix: two contexts — targets subscribe only to an identity-stable setter (a no-op for an
unchanged frame); only the overlay reads the frame. `components/tutorial/spotlight.test.tsx`
pins that an active target re-measuring for 5 s causes zero re-renders. The scene
suites had also been failing to import (expo-router / safe-area under Jest) — they now
run through `scenes/jest-scene-mocks.ts`.
