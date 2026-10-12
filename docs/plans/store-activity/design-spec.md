# Store Activity & Approvals: design spec (merchant app)

v1 · 2026-10-12 · For the engineers building Phases 2–4 of the [approved plan](https://claude.ai/artifact/RtAT4bb24pseDDN43Vz8WU), working to `docs/plans/store-activity/contract.md`. Where this spec and the contract disagree, the contract wins. Proposed contract changes are marked **[contract?]**.

Evidence labels: **[strong]** means a primary source or platform documentation. **[moderate]** means a credible study or a vendor's own documentation. **[weak]** means practitioner or vendor-marketing claims, or my own inference. Anything marked **[verify]** must be checked on a device before launch.

---

## 0. Six findings that change the build

1. **On Android, a lock-screen "Approve" does not require unlocking unless it opens the app.** In the installed `expo-notifications@0.32.17`, `isAuthenticationRequired` is typed `@platform ios`. On Android, an action with `opensAppToForeground: false` is sent as a broadcast `PendingIntent`, which runs with the phone still locked (`NotificationsService.kt` ~L457–471). The contract requires a device unlock, so **Approve must use `opensAppToForeground: true` on both platforms**, plus `isAuthenticationRequired: true` on iOS. Expo's own type docs say a non-foreground action "will not trigger listeners if your app is killed". A background approve would be unreliable as well as insecure. **[strong: read from source]**
2. **A wrong Android `channelId` makes the push disappear without any error.** Expo's docs say that if the channel "does not exist on the device… the notification will not be displayed" ([Expo: sending notifications](https://docs.expo.dev/push-notifications/sending-notifications/)). Phones on an older binary or OTA bundle won't have an `approvals` channel. The server must know which tokens have registered the channel (see §3.12). **[strong]**
3. **The theme's secondary text color fails contrast for feed metadata.** `textSecondary #8B857B` measures 3.66:1 on white cards and 3.10:1 on the cream canvas. WCAG AA needs 4.5:1 for 13px text ([Android a11y](https://developer.android.com/guide/topics/ui/accessibility/apps), [Apple HIG a11y](https://developer.apple.com/design/human-interface-guidelines/accessibility)). Add a token `textMuted: "#6E685E"` (5.52:1 on white, 4.68:1 on canvas) and use it for every meta line in these screens. White on coral `#E4572E` measures 3.68:1, which fails for button labels. Primary buttons here are ink (`primary`) or `#B23E1B` (5.84:1). `warning #F59E0B` must never be used as text (2.15:1). Flag chips use `statusPending` (`#92400E` on `#FBF1DD`, 6.32:1). **[strong: computed]**
4. **`formatPeso(-185)` renders "₱-185.00".** Add `formatSignedPeso` that renders "−₱185" with U+2212, and "+₱10". It drops centavos when they are zero.
5. **The app has no toast/undo bar, no bell glyph, no haptics, no biometrics and no FlashList.** We need a new `UndoBar`, a new `bell` glyph in `Icon.tsx`, and `expo-haptics` as a "should" (it's a native module, so it needs an EAS build; feature-detect it so OTA bundles on old binaries don't crash).
6. **The Philippine Senior Citizen and PWD discounts are a legal 20% (RA 9994 / RA 10754).** A rule of "discount over 20% needs approval" happens to exclude them. That works by luck. Model statutory discounts as their own discount kind: never sent for approval, and never counted as "money that didn't stay". Otherwise the Summary will penalise stores that serve seniors. **[strong for the law; how stores record these discounts today is unverified]**

---

## 1. Design principles

**P1. Summary before detail.** Every list opens with its verdict. The day header says "Today · ₱185 refunded · 1 cancel · drawer −₱100", and the Summary tab leads with one number. Evidence: progressive disclosure reduces errors and learning time ([NN/g](https://www.nngroup.com/videos/progressive-disclosure/)). The existing `DayHistoryList` already argues that "the day is the unit an owner thinks in". *Rule:* no screen opens on a raw list. A day header or headline always comes first.

**P2. One row is one sentence.** *Rule:* each row answers who, what and how much at a glance. Line 1 is the title sentence, for example "Ana refunded #14". Line 2 is the reason plus a second name, for example "Wrong item · approved by Marco". The amount and time sit right-aligned on top of each other. Rows have **2 lines max** (`numberOfLines={1}` each) at default font scale. Raw before/after JSON and seconds-precision times go only in the detail sheet.

**P3. Flag exceptions, not noise.** Alert fatigue is real and gets worse with repeats. Clinicians override 49–96% of drug alerts, and acceptance falls as repeated alerts grow ([Ancker 2017, BMC](https://bmcmedinformdecismak.biomedcentral.com/articles/10.1186/s12911-017-0430-8)) **[moderate; different domain]**. *Rules:* routine events fold into one roll-up row. A flag must have a plain-language reason the owner could repeat to the staff member. **Target under 3 open flags per store-day on median**: if live data shows more, raise the thresholds rather than adding UI. Never flag the same subject twice for the same rule.

**P4. Two names on every money decision.** Toast reports "Voids by Server" next to "Voids by Approver" ([Toast](https://support.toasttab.com/en/article/Exceptions-Report-Overview)). *Rule:* any row with an approver shows both names. Copy frames this as protecting the cashier ("approved by Marco"), not as policing them.

**P5. Hard to do by accident, easy to recover.** Confirmations work only when rare and specific. "If you cry wolf too many times, people will stop paying attention" ([NN/g](https://www.nngroup.com/articles/confirmation-dialog/)). Prefer undo to warnings ([Raskin, A List Apart](https://alistapart.com/article/neveruseawarning)). *Rules:*
- Approving in the app uses `SlideAction`, and its label names the amount.
- Approving from a push gets a 4-second undo before anything is sent.
- Declining always needs a reason, and nothing else asks "Are you sure?".
- Button labels name the outcome: "Approve ₱185", "Send for approval · ₱185". Never "OK" or "Yes".

**P6. Thumb-first, one-handed.** About 49% of phone use is one-handed and thumbs drive about 75% of interactions ([Hoober, UXmatters](https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php)) **[moderate; 2013, smaller phones]**. *Rules:*
- Primary decisions sit in a bottom dock.
- Every tap target is at least 48×48 (Android 48dp, iOS 44pt; [Android](https://developer.android.com/guide/topics/ui/accessibility/apps)).
- Destructive actions are never directly next to the primary one.

**P7. Never color alone, never a red screen.** *Rules:* every status carries a word and a shape as well as a color ([WCAG 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)). Flags are amber "Check" chips with the `warning` glyph. Red is reserved for amounts leaving the store, and even then the minus sign carries the meaning.

**P8. Watch the pattern, not the person.** Monitoring can lower honesty: in an experiment, workers who were told they were monitored cheated more, and fair treatment softened the effect ([HBR via ASU](https://news.wpcarey.asu.edu/20220627-monitoring-employees-makes-them-more-likely-break-rules)) **[moderate]**. Rankings raise effort but breed sabotage and destructive competition ([systematic review](https://cris-portal.uni-muenster.de/portal/en/publication/79688768); [IESE](https://www.iese.edu/insight/?p=3152)). *Rules:* compare each person only with their own normal. No leaderboards. Flags are never visible to peers. Corrections happen in private (§5).

---

## 2. Personas, JTBD, top tasks

**Owner (Ate Lorna, 44).** She runs 1–3 branches, is often away from the store, and uses a mid-range Android phone. JTBD: *"When I'm not at the store, I want to know nothing is leaking and to answer my staff fast, so customers aren't kept waiting and I don't have to be there."*

| # | Task | Target |
|---|---|---|
| 1 | Approve a refund from a push | 2 taps (Approve, then unlock) · under 10 s from notification |
| 2 | Decline with a reason | 3 taps (Decline… → chip → Send) · under 15 s |
| 3 | "Was today OK?" | 1 tap (digest push or Summary) · under 5 s to the verdict |
| 4 | Check a flagged event and mark it reviewed | 3 taps · under 30 s |
| 5 | Change a limit or give a manager "Approve requests" | under 60 s, never more than 2 screens deep |

**Branch manager (Marco, 29).** He works on the floor with an Android phone in his apron. JTBD: *"When a cashier hits a wall, I want to unblock them in seconds without walking over, so the queue keeps moving and the owner trusts my calls."* Tasks: approve in-app from the Home card (2 taps + slide, under 15 s); read the cashier's reason and the order context before deciding; see his branch's day; close out the drawers summary; find one order's history by number (search, under 10 s).

**Cashier (Ana, 21).** She uses a shared counter phone or iPad and may not be confident with tech. JTBD: *"When a customer needs money back, I want to ask the right person and get an answer while the customer is still here, without looking like I did something wrong."* Tasks:
1. Ask for a refund with a reason: 4 taps + optional note · under 30 s
2. Know the request is waiting and who has it: 0 taps (live card)
3. Act on the answer: 1 tap
4. Withdraw a request she sent by mistake: 2 taps
5. See her own activity today: 1 tap

---

## 3. Screen-by-screen spec

Shared states apply to every screen:

| State | Treatment |
|---|---|
| Loading (first load) | Skeleton rows matching the real row geometry (6 rows). This is a full-screen load, which is what NN/g says skeletons are for ([NN/g](https://www.nngroup.com/articles/skeleton-screens/)). No spinner. After 10 s, show `ErrorState`. |
| Refreshing | Pull-to-refresh spinner only. Cached rows stay visible (TanStack cache). |
| Error with cached data | An inline banner above the list: **"Couldn't refresh. Showing what we had at 12:41 PM."** · [Try again]. Never wipe cached rows. |
| Error, no cache | `ErrorState title="Couldn't load activity" message="Check your connection and try again."` |
| Offline | A thin banner: **"You're offline. Showing activity up to 12:41 PM."** Write actions are disabled, with the reason in place (see each screen). |
| Permission-limited | The screen tells the user what they're seeing, never an empty mystery (see each screen). |

### 3.1 Activity feed (Activity screen → "Activity" tab)

**Entry points:** Reports hub → new "Store" section → "Store activity". Also staff profile and ingredient page (pre-filtered), and the "Needs a look" count on Summary.

**Layout, top to bottom:**
1. `ScreenHeader title="Activity"`. Subtitle: `"Today · Makati branch"` (period · scope). Actions, at most 2 `IconButton`s: search, export.
2. `SegmentedControl`: **To review (n)**, **Activity**, **Summary**. To review appears only for approvers. The screen opens on To review while anything is pending, otherwise on Activity. Counts go in the label ("To review · 2"); `SegmentedControl` has no badge slot.
3. Quick filter chips in one horizontal row. Scrolling is acceptable here: these switch often, and the full set lives in the sheet. Chips: **All · Needs a look (2) · Money · Stock · Cash · Loyalty · Menu · Team**. Team is owner-only. The last chip is **Filter** with a count when the sheet has active filters.
4. `FilterChipsRow` echoing sheet filters ("Ana ×", "Last 7 days ×", "Clear all").
5. List: flattened `[dayHeader, row, row, rollup, dayHeader, …]` with `stickyHeaderIndices` for the day headers.

**Day header** (bold day, then a muted summary):
- `"Today"` · `"₱185 refunded · 1 cancel · drawer −₱100"`
- All-clear day: `"Yesterday"` · `"Nothing to check ✓"` (check glyph plus words)
- Days older than yesterday show "Mon 6 Oct".

**Row, 72pt tall at default scale:**
- Left: a 40pt category tile (`ListRow` tile style) with the category glyph. Bottom-right of the tile, a 16pt `StaffAvatar`-style initials ring for the actor. Show "SYS" for system events and a customer glyph for customer-initiated ones.
- Middle, line 1 (15/600 ink): the title sentence from `describe.ts`, plus an inline **Check** chip if there's an open flag, or a muted "✓ Reviewed" if the flag was reviewed.
- Middle, line 2 (13/400 `textMuted`): reason · approver · branch (branch only when viewing all branches).
- Right: the amount (15/800, tabular numbers; `#B23E1B` with "−" for money out, ink otherwise), with the time below it (12/400 `textMuted`, "12:33 PM").

**Roll-up row:** dashed top hairline and a "×38" tile. Line 1 "Stock used by 38 orders", line 2 "Rice 7.6 kg · Pork 4.1 kg · 12 more". Tapping expands it in place (no navigation) to show at most 10 lines and "See all in Stock history".

**Gestures:** tap a row to open the detail sheet. Pull to refresh. Infinite scroll uses the keyset cursor, 50 rows per page.
- **No swipe actions.** They are hidden and easy to trigger by accident while scrolling one-handed.
- **No long-press.**

**Accessibility:** each row is a single element. Its label reads like this: `"Refund. Ana Reyes refunded order 14, 185 pesos. Wrong item. Approved by Marco. 12:33 PM. Needs a look: cash refund on a GCash order."` Add `accessibilityActions=[{name:'activate'},{name:'markReviewed', label:'Mark reviewed'}]` for approvers. Day headers get `accessibilityRole="header"`.

**Performance (low-end Android):** follow [RN FlatList guidance](https://reactnative.dev/docs/optimizing-flatlist-configuration):
- `React.memo` rows, a stable `keyExtractor` (`id`), and `renderItem` in `useCallback`.
- `initialNumToRender={10}`, `windowSize={7}`, `maxToRenderPerBatch={8}`.
- `getItemLayout` only when `fontScale < 1.3` (fixed 72pt rows and 44pt headers).
- No images in rows.
- Don't add FlashList for this feature.

**Font scaling:** don't cap `allowFontScaling` on content. When `useWindowDimensions().fontScale >= 1.3`, switch to a stacked layout: amount and time move under line 2, and lines may wrap to 2 each.

**States:**
- *Empty for the period:* `EmptyState icon="list" title="Quiet so far" message="Refunds, cancels, stock changes and drawer counts will show up here as they happen."`
- *Empty because of filters:* `title="Nothing matches"`, message `"Try a longer period or fewer filters."`, action **"Clear filters"** ([NN/g empty states](https://www.nngroup.com/articles/empty-state-interface-design/): give a way out).
- *Needs a look, none open:* Owl (static) with **"All clear. Nothing needs a look."** and the sub-line `"We'll flag anything unusual, like a paid order cancelled or a drawer off by more than ₱100."` This explains the system and reassures, which is the "zero state as reassurance" pattern.
- *Staff without `activity_view`:* the title becomes **"Your activity"**, there are no chips except period, and no Summary tab. The empty state reads `"Things you do, like refunds, cancels and stock changes, show up here."` **[contract?]** Strip `flags` from rows the caller sees only because they own them. A cashier seeing "Check" on her own row reads as an accusation (§5).

**Don't:** show raw JSON, seconds or UUIDs. Don't paint rows red, let the feed auto-scroll when new rows arrive (show a "3 new" pill at the top instead), or show customer phone numbers beyond the masked form.

### 3.2 Filter sheet

A bottom sheet (`Modal`, `presentationStyle="pageSheet"` on iOS). Groups use `OptionPills`, which wrap on purpose:
- **When:** Today · Yesterday · Last 7 days · This month · Pick dates… (`ReportRangePicker`). Single choice.
- **Who:** staff list with avatars, multi-select, "Everyone" default. Hidden for viewers without `activity_view`.
- **Branch:** only for whole-store accounts. A branch-locked account sees a static line, "Makati branch only".
- **Kind:** the categories, multi-select.
- **Show routine events** (Switch, off by default), with the helper "Every order placed, stamp earned and payment taken."

Footer dock: **"Show 24 events"**. The count is live and debounced 300 ms. When unknown, the button reads "Show events". Next to it, "Reset". Close by swiping down; filters apply only when the button is tapped.

### 3.3 Event detail sheet

A bottom sheet at 85% height that scrolls. Order of content:
1. Kind tile and title (17/700), for example **"Order #22 cancelled"**. Sub-line "₱310 · paid by GCash at 12:11 PM".
2. **Why it's flagged** callout, if flagged: amber surface, warning glyph, the flag's one-line explanation from the copy deck. After review it shows "Reviewed by Lorna · 1:05 PM · 'Talked to Jomar, customer walked out'".
3. Facts card (key/value rows): Who (name · role), Approved by, When ("Today, 12:41:07 PM": seconds appear only here), Where (branch · register), Reason, Note (quoted), Before → After ("₱185 → ₱195").
4. **This order** mini-timeline (§3.5 component, last 5 events) with "See full history".
5. Dock: **[Open order #22]** (secondary) and **[Mark reviewed]** (primary ink, approvers only, flagged rows only).

**Mark reviewed** opens an inline chip row before confirming. Chips: "Talked to them, all good" · "Customer issue, OK" · "Honest mistake, fixed" · "I'll follow up" · "Other". An optional note follows. A chip is optional, so one tap on **Done** works. On success: toast "Marked reviewed" and the row's chip changes to "✓ Reviewed". There's no undo for review: it's logged, low-risk and idempotent.

**Don't:** offer Delete or Edit, show an "Approve" in this sheet, or show the staff member's history of flags here. That belongs on their profile, which only the owner sees.

### 3.4 Summary tab

The question it answers: *"Did money leak today, and is anyone off their normal?"* Layout:
1. Period `SegmentedControl` (Today · 7 days · 30 days) plus a branch line.
2. **Hero, "Money that didn't stay"**: `₱1,375`. Sub-line **"1.9% of sales · usually 0.9%"**. "Usually" means the trailing 28-day rate for the same scope. A thin bar compares the two. If the rate is at or below usual, the sub-line goes `success` with the word "normal" and no red. With under 14 days of history, show **"Not enough history to compare yet"**.
   - Definition, which must be shown behind an ⓘ: refunds + cancels after payment + manual discounts (excluding Senior/PWD) + stock wasted at cost.
3. Four `StatCard`s in a 2×2 grid: Refunded (₱, count) · Cancelled after paying · Discounts · Stock wasted (at cost). Tapping one opens the feed filtered to it.
4. **"Given away on purpose"**, a single muted line: "Vouchers ₱420 · Rewards ₱285 · Senior/PWD ₱610". This keeps marketing and the law separate from leaks, so owners don't see promotions as losses.
5. **Drawers**: "3 shifts closed · 1 short ₱100 · 2 exact". Each over/short shift is a row with the person, amount and time; tapping opens the shift event.
6. **By person** (approvers and owner only): one `ListRow` per active person, sorted *people with something to check first, then A–Z*. No rank numbers. Sub-line: "2 cancels · usually 0–1". The trailing chip is **Check** or **Normal**. Rates are per 100 orders the person handled, so the busiest cashier isn't punished for being busy.
   - A person needs at least 10 shifts of history before a "usually" appears. Before that: "New: no normal yet".
7. Footer: "Flags waiting: 2 · [See them]".

**Empty:** "No sales recorded today yet." **All clear:** the hero becomes "₱0 didn't stay. Clean day!" with a static Owl and the sub-line "All drawers matched." Use this only when every component is 0 and every drawer is exact.

**Don't:** show charts with axes on phones for a single day, rank people, show a percentage without the peso amount, or include unpaid cancels (no money moved).

### 3.5 Per-order History timeline (order screen)

This replaces the totals-only card. It's a vertical timeline, **oldest at the top**: a timeline is read as a story, whereas the feed is read like an inbox, newest first. Each event has a node shape and color plus a word:
- ● green "Paid"
- ◆ amber "Edited", "Requested"
- ✕ red "Cancelled", "Refunded"
- ○ grey everything else

Each line shows the event (15/600), then "12:11 PM · Ana" (13 `textMuted`), with an optional quoted reason in a `surfaceSubtle` bubble. Item changes appear as "−1 Chicken Sisig (₱185)". A pending approval shows inline as **"Refund requested · waiting for Marco · 3 min"**.

Collapse to the last 4 events with "Show all 9", and auto-expand if there's an open request.

**Empty (legacy orders before backfill):** "History starts 1 Jul 2026. Older changes weren't recorded."

### 3.6 Approval inbox ("To review" tab)

Wise puts approvals in "Tasks" on Home ([Wise](https://wise.com/help/articles/PhxIBARqUVe4P7yZNVxZw/how-do-i-approvereject-a-payment-requiring-approval)). Brex moved approvals out of the transactions tab because they were "hard to find" ([Brex](https://www.brex.com/product-announcements/payment-approvals-now-easier-to-find-in-app)). So approvals are a tab of their own and a Home card, never feed rows.

**Card per pending request**, oldest first (fairness: first asked, first answered):
- Line 1: **"Refund ₱185 · #14"**
- Line 2: "Ana · Wrong item served · 2 min ago"
- Right: a time-left chip, shown only in the last 10 minutes ("8 min left", amber)
- Bottom of the card: **[Review]** full width (48pt). There's no inline Approve: deciding without context defeats the review screen. One exception: within the approver's limit and with no signals, the card may show **[Approve ₱185]** plus **Review**. Ship that as a *should*, behind a flag, after usability testing.

Section **"Done today"** below, collapsed: "Approved 3 · Declined 1 · Expired 0", which expands to rows.

**Empty:** static Owl with **"Nothing waiting. Your team's all set."** and the sub-line "When someone asks for a refund, cancel, big discount or write-off, it lands here and on your phone."

**Permission-limited** (holds `approve_requests` but is branch-locked): subtitle "Requests from Makati branch". Requests above the person's limit show **"Over your ₱1,000 limit · sent to the owner"**, greyed and read-only, so the manager knows it's being handled.

### 3.7 Approval review screen

Full screen (stack push, `BackHeader` with ✕). The goal is a decision in under 10 seconds. Order follows decision weight:

1. Header: **"Refund request"**, with "Order #14 · Table 3 · placed 28 min ago".
2. **Amount card**: `₱185.00` (32/800). Sub-line "of ₱480 paid in cash · comes out of Ana's drawer". Then the item lines (qty × name, ₱) and the stock consequence ("Not put back in stock · logged as waste").
3. **Who and why**: `StaffAvatar md`, "Ana Reyes", "Cashier · on shift since 8:02 AM · asked 1 min ago". The reason chip and the note quoted in her own words.
4. **Worth knowing**: 1–3 signals, each with a shape plus a word. A green ● reads as reassuring, an amber ◆ as worth checking:
   - "Ana's first refund request this week" / "3rd refund request today (usually 0–1)"
   - "This order was edited once before (−₱60)"
   - "Paid by GCash. A cash refund would be flagged."
   - "Within your ₱1,000 limit"
   - Never show more than 3. Choose them by severity.
5. "Expires in 27 min if nobody answers" (13 `textMuted`, centered).
6. **Bottom dock:**
   - `SlideAction label="Slide to approve ₱185"`
   - Below it, two text buttons 48pt tall, at least 24pt apart: **"Decline…"** (danger text, left) and **"Change amount"** (ink, right; refunds only). Change amount opens a numeric stepper sheet that's capped at the request amount. Approving a lower amount still sends the request through the same execution path.

**On approve:** the knob shows a spinner, then the screen changes to a result state: ✓ **"Approved. Ana can give back ₱185 now."** Show the R-number once it has executed. Auto-close after 2 s or on tap. If the server reports `failed`, show **"Couldn't finish: the order changed since Ana asked. She's been told."** with [OK].

**Concurrency:** if another approver decided first, show "Marco already approved this at 12:34 PM" and disable the dock. If the request expired or was withdrawn while open, show "Ana withdrew this request" or "This request expired".

**Above the approver's limit:** the dock is replaced by "Over your ₱1,000 limit. The owner has been asked." with no slide.

**Offline:** the dock is disabled with **"You're offline. Connect to approve."**

**A11y:** `SlideAction` needs an accessible alternative, because screen-reader users can't drag. Add `accessibilityRole="button"`, `accessibilityLabel="Approve 185 pesos"` and `accessibilityActions [{name:'activate'}]` that calls `onComplete`. Also respect `isScreenReaderEnabled` by showing a plain **[Approve ₱185]** button instead. This is a gap in today's `SlideAction`.

**Don't:** put Approve and Decline side by side as equal buttons, pre-select a decline reason, show the customer's name or phone, or show a big red "DECLINE".

### 3.8 Cashier request sheet (refund / cancel paid / discount / write-off)

A bottom sheet from the order screen. Where the app used to say "You don't have access", it now offers **"Ask a manager"**. One sheet serves all four kinds:
1. Header with the kind and context: **"Refund"**, "Order #14 · paid ₱480 cash".
2. **Scope** (refund only), as a `SegmentedControl`: Items · Amount · Whole order. Items mode uses qty steppers (48pt hit areas). Amount mode uses a peso keypad capped at refundable.
3. **"Why?"**: `OptionPills` reason chips, single-select and **required** (§4). Below them, a note field with placeholder "Add a detail (optional)". The note becomes required only for "Other".
4. **Stock switch** (refund/cancel), pre-set by the reason: "Put back in stock". Wrong item → off, logged as waste. Changed mind before cooking → on.
5. **Who will be asked** callout, which must be specific: "**Needs approval.** Marco and Lorna will get a notification. You'll see the answer on this order." If the requester can act directly, there is no callout and the button changes.
6. Dock button: **"Send for approval · ₱185"** (ink), or **"Refund ₱185 now"** when within the person's own direct limit.

**Validation:** the button is disabled until a reason is chosen. The disabled hint reads "Pick a reason first". Use a retry key per open sheet, so a double tap files one request.

**Offline:** the button is disabled with "You're offline. Requests need internet so they're never sent twice."

**Limits:** "You already have 3 requests waiting. Wait for an answer or withdraw one."

**Don't:** ask "Are you sure?" (the button already names the outcome), mention flags, or let the note be the only reason.

### 3.9 Requester live-status card

A card pinned at the top of the order screen while a request exists. It updates through realtime, with polling every 10 s as a fallback.

| Status | Card copy | Actions |
|---|---|---|
| Sending | "Sending to Marco and Lorna…" | none |
| Pending | **"Waiting for Marco or Lorna"** · "Asked 2 min ago · expires 12:58 PM" | **Withdraw** (text, 2-step: "Withdraw request?" with "Withdraw" / "Keep waiting") |
| Approved → executing | "Approved by Marco · finishing…" | none |
| Executed | ✓ **"Approved by Marco. Give ₱185 back from your drawer."** R-0042 · refund slip printing | **Print slip again** · **Done** |
| Declined | **"Marco said not this time"** · reason chip · his note quoted | **Ask again with changes** · **OK** |
| Expired | "No answer in 30 min. The request closed." | **Ask again** |
| Failed | "Approved, but it couldn't finish: the order changed. Nothing was refunded." | **Ask again** |

The decline copy is deliberately softened ("said not this time"). The reason is shown, never hidden, because closing the loop builds trust and an unexplained "no" invites rumours. If the app is in the foreground, play a short tone and a light haptic on approve or decline, and show a toast if the cashier is on another screen ("Marco approved the refund on #14 · View").

### 3.10 Approval rules screen (owner only)

Manage hub → Team → "Approval rules". It's a single screen, written as sentences with inline steppers rather than a settings grid:
- "Staff with **Refunds** can refund up to **[₱300]** on the same day without asking."
- "People who can approve can say yes up to **[₱1,000]**. Bigger ones come to you."
- "Discounts over **[20%]** need approval. *Senior & PWD discounts never do.*"
- "Write-offs over **[₱500]** at cost need approval."
- "Requests close after **[30 min]** if nobody answers."
- **Who can approve:** a list of people with `approve_requests` (`StaffAvatar` + branch), plus **"Give someone access"**, which opens Team.
- Footer: "Changes are recorded in Activity. Last changed by Lorna, 12 Oct."

Steppers use preset jumps (₱100 / ₱500 steps), and tapping the value opens a keypad. Saving uses a sticky dock **"Save changes"** that appears only when the screen is dirty. Toast: "Rules saved".

**Granting `approve_requests`** (in `StaffAccessPanel`): the toggle reads "Approve requests". Its helper text: "Can say yes to refunds, cancels, discounts and write-offs up to ₱1,000 for Makati branch. They'll get a notification for each request." Turning it on opens a confirm sheet that restates exactly that, with **[Give access]** / **[Not now]**. Do the same for "See store activity": "Can see everything that happens in Makati branch, including other staff's refunds and drawer counts."

### 3.11 Home bell + "Needs your review" card

- **Card** above "Needs attention" while at least one request is pending for the viewer.
  - With one request: **"Ana is waiting"** · "Refund ₱185 on #14 · 2 min ago" · **[Review]**.
  - With several: **"3 requests waiting"** · "Oldest: Ana, 6 min ago" · **[See all]**.
  - The accent is a left border in `accent`, not a red fill.
- **Bell:** reuse the `merchant_notifications` bell being built in the other session. Don't build a second one (contract note). Approval items in the bell deep-link to the review screen. The bell count = unread notifications. The pending-approval count is shown on the card, not the badge ("use a badge only to show… unread notifications"; [Apple HIG notifications](https://developer.apple.com/design/human-interface-guidelines/notifications)).

### 3.12 Push notifications

**Categories** (register at startup, before requesting a token; identifiers must not contain `:` or `-` per [Expo docs](https://docs.expo.dev/versions/latest/sdk/notifications/)):

| categoryId | Actions |
|---|---|
| `approval_within_limit` | `approve` "Approve" `{opensAppToForeground:true, isAuthenticationRequired:true}` · `decline` "Decline…" `{opensAppToForeground:true, isDestructive:true}` |
| `approval_over_limit` | none (tapping opens the review screen). The HIG says to avoid actions that only open the app. |
| `approval_result` | none |
| `activity_digest` | none |

**Approve flow (both platforms):** the tap unlocks the phone (iOS by flag; Android via the activity `PendingIntent` **[verify on Android 12–15 that the keyguard prompt appears]**). The app cold-starts into an **Approving overlay**: "Approving ₱185 for Ana…", a 4-second countdown ring and **[Undo]**. Only after the countdown does it POST the decision with `source:'push'`. This covers the adjacent-buttons mis-tap risk.
- Read the response with `getLastNotificationResponseAsync` at startup and register the listener at module top level ([Expo: what you need to know](https://docs.expo.dev/push-notifications/what-you-need-to-know/)).
- Before posting, re-check the request through `GET /api/approvals`. If it's already decided, expired, or above the limit (rules changed), show the review screen instead.
- **Apple Watch [verify]:** the system picks the "first nondestructive action" on double-tap ([HIG](https://developer.apple.com/design/human-interface-guidelines/notifications)), which would be Approve. Test whether an auth-required foreground action can fire from the Watch. If it can, put a nondestructive "Review" first for watch-paired devices, or drop the action.

**Decline flow:** opens the review screen with the decline sheet already open.

**Copy:** sentence case, no app name ([HIG](https://developer.apple.com/design/human-interface-guidelines/notifications)), no customer data (contract). Pushes may show order number, amount and staff first name.

| Kind | Title | Body |
|---|---|---|
| Refund request | `Refund ₱185 · Order #14` | `Ana: Wrong item served` |
| Cancel paid order | `Cancel paid order #22 · ₱310` | `Jomar: Customer left` |
| Discount | `Discount 30% · Order #9 (−₱144)` | `Ana: Make up for a problem` |
| Write-off | `Write off 2 kg pork belly · ₱640` | `Marco: Spoiled` |
| Over limit (to owner) | `Refund ₱1,450 · Order #31` | `Ana: Charged twice · over Marco's limit` |
| Batched (≥2 within 60 s) | `3 requests waiting · ₱740` | `Ana, Jomar · tap to review` (no actions; never bulk-approve blind) |
| Result to cashier | `Approved: refund ₱185 on #14` | `Marco said yes. Give it back from your drawer.` |
| Declined to cashier | `Not approved: refund on #14` | `Marco: Offer a replacement instead` |
| Expired to cashier | `No answer: refund on #14` | `The request closed after 30 min. You can ask again.` |
| Closing digest | `Today: ₱18,420 sales · all clear` / `Today: ₱18,420 sales · 2 things to check` | `2 cancels by one cashier · a drawer ₱100 short` |

- **Hidden previews:** set iOS `previewPlaceholder` to "Request".
- **Grouping:** `threadId` = `approvals:{tenantId}`. Use `collapseId` = approval id, so when someone else decides, the server sends a replacement that removes the stale buttons: "Marco approved ₱185 for Ana", no actions. On Android, the "already decided" check in the app is the backstop.
- Never send a second push for the same request, even if unanswered ([HIG](https://developer.apple.com/design/human-interface-guidelines/notifications): "Avoid sending multiple notifications for the same thing"). Escalate to the owner at most once, at 15 minutes, and only if no in-limit approver has answered.
- **Android channels:**
  - `approvals`: HIGH importance, a sound distinct from the new-order ringtone, vibration.
  - `activity`: DEFAULT importance, for digests and results.
  - Create them before getting the token (Android 13 permission prompt rule, [Expo](https://docs.expo.dev/versions/latest/sdk/notifications/)).
  - **[contract?]** Store `channels` per row in `platform_device_tokens`. The server sends `channelId:'approvals'` only to tokens that reported it, and omits `channelId` otherwise.
- **iOS interruption level:** approvals `time-sensitive` so they break through Focus. That needs the `com.apple.developer.usernotifications.time-sensitive` entitlement in `ios.entitlements` and a new EAS build **[weak: Expo path unverified; test on a fresh install]**. Digests are `passive`.
- **Quiet hours:** approval pushes are never suppressed, because a customer is waiting. Digests go at closing time + 30 min (store hours) or 10:00 PM, and never after 11:00 PM Manila.
- **Volume budget:** surveys suggest notifications get disabled at 2–5 per week for typical apps ([Localytics via MarketingProfs](https://www.marketingprofs.com/charts/2018/33486/how-many-mobile-push-notifications-are-too-many)) **[weak; consumer apps]**. Approvals are task-driven and wanted, but the digest is optional: off by default for managers, on for owners.

**Permission priming:** ask at the moment of value ([Apple HIG managing notifications](https://developer.apple.com/design/human-interface-guidelines/managing-notifications); [vendor data, weak](https://www.braze.com/resources/articles/whats-a-push-primer)). That moment is the first time an approver opens To review, or right after the owner grants `approve_requests` to themselves or a manager. Primer sheet: Owl, then **"Get a ping when your team needs you"**, then "Approve refunds and cancels from your lock screen. We only notify you about requests and your daily summary." Buttons: **[Turn on notifications]** / **[Not now]**. If permission was denied before: "Notifications are off for WebNegosyo. Turn them on in Settings." with **[Open Settings]**.

---

## 4. Copy deck

**Voice:** plain, warm and specific. Monzo's "straightforward kindness" is the model ([Monzo](https://monzo.com/tone-of-voice/)). Active voice, so the actor is always named. English by default. Light Taglish only in celebratory or empty states and optional notes. Never in money, error or decline copy, where ambiguity costs money and Taglish can read as flippant. Evidence for Taglish in UI is thin and dated ([2014 survey, 60/40 Filipino/English preference](https://www.slideshare.net/slideshow/philippines-36867505/36867505)) **[weak]**, so test it (§8).

**Refund reasons:** Wrong item served · Food quality · Missing item · Took too long · Charged twice · Customer changed mind · Other

**Cancel paid order:** Customer left · Customer changed mind · Ordered twice by mistake · Wrong order entered · Item ran out · Store closing · Other

**Discount:** Make up for a problem · Regular customer (suki) · Promo not in the system · Staff meal · Owner's guest · Other. Senior/PWD is a separate statutory discount and never appears here.

**Write-off:** Spoiled · Expired · Dropped or spilled · Cooking mistake · Returned by customer · Count correction · Other

**Decline reasons** (they describe the next step, not the person): Let's talk first · Offer a replacement instead · Amount looks off, please check · Already handled · Not covered by our policy · Other
- The decline note placeholder is "Tell Ana what to do next (optional)".

**Flags** (name · one-line explanation shown in the detail sheet):

| Flag | Chip | Explanation |
|---|---|---|
| paid_then_cancelled | Check | "Cancelled after it was paid, and no refund has been recorded yet." |
| cash_refund_noncash_order | Check | "Refunded in cash, but the customer paid by GCash, Maya or card." |
| after_hours | Check | "Done after the shift or the store had closed." |
| drawer_variance | Check | "Drawer counted ₱100 or more away from what was expected." |
| removed_after_kitchen | Check | "Items were removed after the kitchen already had them." |
| repeat_cancels | Check | "Third cancel by the same person today. Usually it's 0–1." |
| count_variance | Check | "Stock count off by more than 10% for this item." |
| duplicate_deduction | Check | "A second stock deduction for this order was blocked. Stock is correct, but worth knowing." |

The section header is **"Needs a look"**, never "Suspicious", "Alert", "Fraud" or "Violation". Every explanation describes the event, never the person.

**Empty states:** "Quiet so far." · "All clear. Nothing needs a look." · "Nothing waiting. Your team's all set." · "Nothing matches." Clean day: "₱0 didn't stay. Clean day!" (optional Taglish variant to test: "Malinis ang araw!")

**Errors:**
- "Couldn't refresh. Showing what we had at 12:41 PM."
- "You're offline. Requests need internet so they're never sent twice."
- "Couldn't send the request. Nothing was sent. Try again."
- "Couldn't finish: the order changed since Ana asked. Nothing was refunded."
- "That request was already answered by Marco."

**Toasts:** "Request sent to Marco and Lorna" · "Approved. ₱185 refund for Ana." · "Declined. Ana has been told." · "Marked reviewed" · "Rules saved" · "Request withdrawn".

---

## 5. Fairness and trust guidelines

1. **Private by default.** Flags and per-person views are visible only to the owner and to holders of `activity_view` or `approve_requests` for that branch. Never show flags to peers or to the person flagged (**[contract?]** strip `flags` on own-only rows). In Filipino workplaces, public correction causes *hiya* that the whole team feels ([practitioner guide](https://onecoredevit.com/news-and-insights/human-resources/feedback-in-the-philippine-workplace-a-guide-for-team-success/)) **[weak; practitioner sources; avoid essentialising]**.
2. **Explain every flag in one sentence an owner could say out loud.** No scores, no "risk 87".
3. **Own normal only.** Per-person numbers are rates per 100 orders handled, against that person's trailing 28 days. Show "usually" only after at least 10 shifts.
4. **No rankings, no "worst cashier", no red names.** Sort by "has something to check", then alphabetically.
5. **The second name protects the cashier.** Every approved action reads "approved by Marco". The copy never implies the cashier acted alone when they didn't.
6. **Declines describe the next step.** Every decline reason is an instruction ("Offer a replacement instead"), not a judgment.
7. **Reviews close the loop privately.** "Mark reviewed" chips include "Honest mistake, fixed", which normalises mistakes as fixable.
8. **Tell staff what's recorded.** First run for staff, a one-time card: **"Refunds, cancels and stock changes are recorded with your name. Each one that needs approval shows who approved it too, so you're covered."** Telling people openly is a fairness signal, and fairness softened the monitoring effect in the HBR study **[moderate]**.
9. **Don't gamify the absence of events.** A "clean-day streak" would reward *not recording* waste or refunds. That's a perverse incentive. Celebrate the owner's *review habit* instead (§6).
10. **Respect for the boss without fear.** The cashier's sheet names the approver by first name and says what will happen. No "your manager will be alerted". Ask, don't report.

---

## 6. Delight and habit

**Closing digest (the ritual).** One push a day at closing (§3.12). Tapping it opens Summary for that day. It's built on a trigger → easy action → visible outcome loop. The digest is one card with a verdict, so the habit costs 5 seconds.
- **All clear:** "Today: ₱18,420 sales · all clear." The Summary shows the static Owl and "Clean day!"
- **Things to check:** list them and give one button, **"Review 2"**, which steps through the flags with Next. When the last one is done: "All reviewed ✓".

**Streaks done responsibly.** Count consecutive days the owner *opened the digest or cleared all flags*: "Checked in 5 days in a row". Show it as a small line on Summary, never as a push. Missing a day resets it silently, with no guilt copy. Duolingo's data shows small, real effects from streak mechanics and flexibility (+0.38% DAU from a second Streak Freeze; [Duolingo](https://blog.duolingo.com/how-duolingo-streak-builds-habit)) **[moderate; a different product]**. Treat streaks as a garnish, not a growth lever.

**Micro-interactions:**
- The slide fills green and the knob turns to ✓ (150 ms).
- An approved status card cross-fades from amber to green (200 ms).
- A newly arrived feed row fades in only when the user taps the "3 new" pill.
- Respect `AccessibilityInfo.isReduceMotionEnabled`: cross-fades only.

**Haptics (should):** add `expo-haptics`.
- Success notification haptic on approve/decline sent and on result received.
- Selection haptic on reason chips.
- Warning haptic on a failed execution.
- It needs an EAS build, so guard the import (`NativeModulesProxy.ExpoHaptics` check) so OTA bundles still run on old binaries. In loud kitchens, haptics are the only feedback that reliably lands **[weak: inference]**.

**Owl mascot rules:**
- Owl appears **only** on: all-clear and empty-good states, the clean-day Summary, the permission primer and first-run education.
- **Never** next to a flag, a decline, an error, a person's numbers or any money-out amount. A cute mascot beside a cashier's mistake reads as mockery.
- Use a static image (there's no Lottie; the GIF is for loading).
- At most one Owl per screen.
- Owl never "speaks" in first person about staff.

---

## 7. Components

| Component | Status | Props / notes |
|---|---|---|
| `ScreenHeader` | reuse | `title`, `subtitle` ("Today · Makati branch"), `actions` (≤2 `IconButton`) |
| `SegmentedControl` | reuse | `options=[{label:'To review · 2',value:'review'},…]`, `accessibilityPrefix="Show"` |
| `OptionPills` | reuse | reason chips (`mode="single"`), filter sheet groups (`mode="multi"`), review chips |
| `FilterChipsRow` | reuse/generalise | currently typed to `ProductFilterChip`; widen to `{key,label}` |
| `SlideAction` | reuse + fix | add `accessibilityLabel`, accessibility `activate` action, screen-reader fallback button, optional `tone` |
| `EmptyState` | reuse + extend | add `illustration?: 'owl'` (static image) |
| `ErrorState`, `Button`, `IconButton`, `StatCard`, `ListRow`, `Modal`, `StaffAvatar` | reuse | `ListRow` for By person/rules; `StaffAvatar sm` |
| `ReportRangePicker` | reuse | custom dates in the filter sheet |
| `ActivityRow` | new | `{event: StoreActivityEvent, describe: Described, showBranch, canReview, onPress}`; memoised; fixed 72pt |
| `ActivityDayHeader` | new | `{dayLabel, summary, isAllClear}` |
| `ActivityRollupRow` | new | `{count, title, lines, onExpand, isExpanded}` |
| `ActivitySkeleton` | new | `{rows=6}`; matches row geometry; static (no shimmer on low-end devices, shimmer only if `!reduceMotion`) |
| `EventDetailSheet` | new | `{eventId, onOpenOrder, onReviewed}` |
| `FlagChip` | new | `{flag, isReviewed}` → "Check" + warning glyph / "✓ Reviewed" |
| `OrderHistoryTimeline` | new | `{events, collapsedCount=4, pendingApproval?}` |
| `ApprovalCard` | new | `{request, viewerLimit, onReview, onQuickApprove?}` |
| `ApprovalReviewScreen` | new route | `app/(main)/approval/[id].tsx`, registered in the nav map |
| `RequestSheet` | new | `{kind:'refund'|'cancel_paid'|'discount'|'stock_writeoff', order|item, canActDirectly, approverNames}` |
| `RequestStatusCard` | new | `{request, onWithdraw, onAskAgain, onPrintSlip}` |
| `SignalList` | new | `{signals: {tone:'ok'|'check', text}[]}` max 3 |
| `ApprovingOverlay` | new | `{amountLabel, requesterName, seconds=4, onUndo, onCommit}` |
| `UndoBar` / `Toast` | new (none exists) | `{message, actionLabel?, onAction?, durationMs=4000}`; one at a time; above the tab bar |
| `NotificationPrimer` | new | `{onEnable, onDismiss}` |
| `RulesSentenceRow` | new | `{prefix, value, unit, step, min, max, suffix, onChange}` |
| `Icon` `bell` glyph | new | SVG path in `GLYPHS` |
| `formatSignedPeso` | new util | "−₱185", "+₱10", trims ".00" |
| theme `textMuted` | new token | `#6E685E` |

---

## 8. Usability test plan and launch metrics

**Participants (5):** 2 owners (one multi-branch, one away from the store most days), 1 branch manager, 2 cashiers (one under 25, one less confident with tech). Use at least 3 mid-range Android phones and 1 iPad register. Recruit from current platform stores, with a ₱500 GCash thank-you.

**Setting:** in-store, off-peak (2–4 PM), with real noise. A Taglish-speaking moderator, think-aloud, 30 minutes each. Use the test-store build behind a feature flag with seeded data, including two flags and one pending request.

| # | Task (said in the participant's words) | Success | Target |
|---|---|---|---|
| T1 (owner/mgr) | "Your cashier sent you something. Answer it." Phone locked, push arrives | Approves from push, no help | 4/5, median under 10 s |
| T2 (owner/mgr) | "You don't want to refund this one. Say no, nicely." | Declines with a reason | 5/5, under 20 s |
| T3 (owner) | "Was yesterday a good day for the store? Anything to worry about?" | States the verdict and both flags | 4/5, under 30 s |
| T4 (owner) | "Find out what happened with order #22." | Reaches the history via search or row | 4/5, under 30 s |
| T5 (owner) | "Let Marco approve refunds, up to ₱800." | Grants access + changes the limit | 4/5, under 90 s |
| T6 (cashier) | "The customer got the wrong sisig. Get their money back." | Sends a request with the right reason; doesn't toggle stock wrongly | 5/5, under 30 s |
| T7 (cashier) | "Did your boss answer? What do you do now?" | Reads the status card and states the next step | 5/5 |
| T8 (cashier) | "You sent that by mistake. Undo it." | Withdraws | 4/5 |

**After each task:** a Single Ease Question (1–7). **Trust probes, at the end:**
- Cashiers: "How would you feel if your boss saw this screen about you?" (show Summary → By person). Target: no "nakakahiya" or "parang binabantayan ako" ("embarrassing", "feels like I'm being watched") reactions in 2 of 2.
- Owners: "Would you trust this enough to stop checking the CCTV for refunds?"

**Copy probe:** A/B "Clean day!" vs "Malinis ang araw!", and "Needs a look" vs "Check". The pass threshold is decided by preference and comprehension, not taste.

**Launch metrics** (instrument from day one; segment by platform backend):

| Metric | Target at 30 days |
|---|---|
| Time-to-decision, median / p90 | under 2 min / under 10 min |
| % requests answered under 5 min | ≥ 70% |
| % requests expired | ≤ 10% |
| Push-approve share (vs in-app) | tracked; undo rate under 5% (higher means mis-taps) |
| Approval vs decline ratio | tracked; a sudden decline spike means unclear rules |
| Weekly active owners on Activity / Summary | ≥ 40% of owners in eligible stores |
| Flags reviewed within 48 h | ≥ 60% |
| Open flags per store-day (median) | under 3 (else retune thresholds) |
| Refund disputes / customer complaints about refunds | down vs a pre-launch baseline from support tickets |
| `approvals` channel or permission disabled | under 5% of approvers |
| Guardrails | register checkout time, order throughput and app crash-free rate unchanged |

---

## 9. Must / should / could

**Must** (cutting any of these hurts usability or trust):
- Approve action `opensAppToForeground:true` on both platforms, plus `isAuthenticationRequired` on iOS. The already-decided re-check on open. The 4-second undo overlay for push approvals.
- Channel-capability gating for `channelId`.
- The `textMuted` contrast token, `formatSignedPeso`, and status shown as a word plus a shape.
- Feed with day headers, roll-ups, 2-line rows, detail sheet, Mark reviewed, the "Needs a look" chip, plus loading, empty, filter-empty, stale and offline states.
- Required reason chips on all four request kinds; the decline reason shown to the requester.
- Review screen with amount → who/why → ≤3 signals → slide; concurrency and expired states.
- Requester status card with all 7 states; Withdraw.
- Home "Needs your review" card; To review tab.
- Flags hidden from the flagged person and from peers; no rankings.
- Senior/PWD excluded from approval thresholds and from "money that didn't stay".
- Screen-reader alternative for `SlideAction`.

**Should:**
- Summary tab with the own-normal per-person view and "Given away on purpose".
- Closing digest push.
- `expo-haptics` (next EAS build).
- Time-sensitive interruption level (entitlement + build).
- Batched pushes, `collapseId` replacement and one-time owner escalation.
- Notification primer.
- Approval rules screen as sentences.
- Grant-access confirm copy.
- Order History timeline on every order.
- Quick "Approve" on inbox cards (behind a flag, after testing).

**Could:**
- Review-habit streak line.
- "Seen by Marco" read state (needs server tracking).
- A staff "add context" note on their own events (new write path).
- Taglish variants after the copy test.
- Apple Watch handling.
- Shimmer skeletons.
- CSV export polish.
- Owl illustration variants.

**Weakest evidence, flagged for the team:** Taglish preference data (2014), push-volume thresholds (consumer surveys), priming lift (vendor claims, with contrary reports), the Android keyguard behaviour for foreground actions, and the Expo time-sensitive entitlement path. Prove each one in the usability test or on devices before relying on it.
