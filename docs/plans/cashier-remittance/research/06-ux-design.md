# 06 — Cashier shift & remittance: UX design

Role: UI/UX designer. Read-only study of `webnegosyo-app/` (main) and the `feat/expenses` worktree (`.claude/worktrees/expenses/webnegosyo-app`), plus the web admin shell. Mockups: `cashier-mockups.html` (same folder).

---

## 0. What exists today (the ground we build on)

| Piece | Where | What it already does | Gap for this feature |
|---|---|---|---|
| Drawer screen | `app/(main)/pos-sales.tsx` (sub-screen of POS, `SUBSCREEN_PARENTS.pos`) | `ShiftCard` + an ink "Today at this counter · Cash" hero + incoming orders + sales list | "Today" = Manila midnight (`localDayStartMs`). Two ink heroes stack when on shift (MyShiftCard and the day hero). That is confusing. |
| Clock in | `components/drawer/ClockInCard.tsx` | Drawer tiles (free / taken "In use · Ana" / zero balance), float prefilled from the till's `startingCash`, one-tap clock in | Typed total only. No denomination count, no "usual float" confirmation, no handover check. |
| On shift | `components/drawer/MyShiftCard.tsx` | Ink card: "Should be in your drawer", the lines that add up to it, "At close, hand over ₱X and keep ₱Y", last 3 moves, buttons **Cash in / out** and **End shift** (coral on ink) | No blind mode, no mid-shift reading, no print. |
| Cash moves | `CashMoveSheet.tsx`, `CASH_MOVE_COPY` (`collect` = "Cash pickup", `pay_out`, `pay_in`) | Segmented kind, big `CashInput`, pickup presets ("All ₱X", "Leave float · ₱Y"), reason | A pickup has no "taken by". It produces no slip. |
| Close | `CountDrawerSheet.tsx` | One typed total, live verdict Balanced / Short / Over, "Recount once before you confirm" | No denominations, no non-cash check, no reason, no recipient, no slip, no acceptance. |
| Owner floor | `DrawersOverview.tsx` (inside ShiftCard for `canManageCash`) | Every open drawer, cash held, **Collect** and **Count** (close on the cashier's behalf) | No remittance inbox and no day close. |
| Till setup | Manage → Cash drawers (`app/(main)/cash-drawers.tsx`, `DrawerEditorSheet`) | Name, standard float, zero balance | No store-level cash rules (business day, blind count, tolerance, who receives). |
| Home | `ShiftStatusStrip.tsx` on `dashboard.tsx` | "On shift · since…" → opens Drawer | Owners see nothing about remittances or the day. |
| Business day | `lib/daily-report/business-day.ts` | Fixed Manila calendar day (+08:00), used by reports, order numbers, Home | Needs a per-store cutoff (see §2). |
| Approvals | `components/approvals/*`, `approve_requests` key | Ask-a-manager inbox with pending/recent, detail screen, offline notice | Reusable pattern for "accept a remittance". |
| Approver PIN | gov-discount `route-guards.ts`, PIN lockouts | Manager PIN at the counter, with rate limits and escalating locks | Reusable for "accept with PIN here". |
| Visual language (newest) | Expenses worktree: `BigAmount` (₱ at 60%, tabular digits), `ExpenseKeypad` (own pad, `00`, long-press for centavos / clear), `NeedsYouCard` (tinted icon well + one button per row), ink hero with `heroInkPositive/Negative` | We adopt it as is. |

Theme (`theme/colors.ts`): canvas `#EFECE6`, card `#FFF`, subtle `#F7F5F0`, ink `#1D1815`, coral accent `#E4572E` / wash `#FBEAE3`, separator `#E5E0D6`, text secondary `#8B857B`, muted `#6E685E` (use this for meta that must stay readable), ink hero `#211B16` / elevated `#2E251E` / text `#FDFBF7`, success `#047857`, warning `#F59E0B` (text `#92400E`), danger `#C0392B`. Radii 8/10/16/full; pill buttons (`radius.full`), heights 36/44/52. Type: title 24/800, screen title 28/800 −0.4, heading 17/700, body 15, caption 13, eyebrow 11/700 uppercase +1. System font (SF / Roboto). The tab bar is a dark rail with amber active: Home · Orders · POS · Reports · Manage.

---

## 1. Design principles for this feature

1. **One money number per screen.** The cashier opens the Drawer to learn one thing: what should be in the box. Keep exactly one ink hero per screen. When a shift is open, MyShiftCard is the hero and the "Today at this counter" hero folds into a quiet line under it.
2. **Count the way hands count.** Bills first, biggest first, the way a cashier fans them out. Then coins. Steppers for small piles, a keypad for big ones, and a "type the total" escape hatch for anyone who already counted on paper.
3. **The cashier's job ends at the slip.** When the cashier remits, the shift is closed and they can go home. Acceptance is the receiver's job and never keeps a cashier waiting at the counter. The only exception is the optional "PIN here now".
4. **Never a false ₱0.** If a figure has not loaded, say "Adding up…" or "Not loaded" (the Expenses hero rule). Never show 0.
5. **Nothing judged by colour alone.** Short / Over / Exact always carry a word and an icon as well as the tint.
6. **Customers can see the POS.** The POS header pill never shows the drawer amount.
7. **Plain English, a little Taglish.** Use "Remit", "float", "pickup" and "Short / Over" (all used at PH counters), and "sukli" once, in a reason chip. Avoid accounting words like "variance", "reconciliation" and "tender".

---

## 2. The business day (the midnight problem)

**Setting:** Manage → Cash drawers → **Shift & remit rules** → "Business day ends at". Choices are chips: `12:00 AM (midnight)` · `1 AM` · `2 AM` · `3 AM` · `4 AM` · `5 AM` · `6 AM`. The default is midnight, so existing stores see no change.

**Preview (live, under the chips):** a 24-hour band from the cutoff to the cutoff, with Friday shaded and a sample late sale marked:

> Sales from **Fri 4:00 AM until Sat 3:59 AM** count as **Friday**.
> A shift belongs to the day it **started**. Ana's 6 PM–3 AM shift is all Friday, even the part after midnight.

Rules the UI must say plainly somewhere:

- **Shift anchor:** `business_day` is stamped on the shift when it opens and never moves. A shift that runs past the cutoff stays on its start day. Day close counts shifts by that stamp, so no remittance is ever split across two days.
- **Effective from the next business day.** The confirmation reads: "Starts from Saturday, Oct 25. Past days keep their dates." Re-dating history would change reports the owner has already read.
- **Where "today" follows it (decision for the owner and engineering):** the Drawer, Remittances and Day close MUST follow the cutoff. Home "Today", the Reports Day view, the daily inventory report and the daily order number (#01 reset) SHOULD follow too, or the owner sees two different Fridays. That touches `business-day.ts`, `localDayStartMs`, the SQL report twins and `assign_daily_order_number`. **Flag:** this is the biggest engineering cost in the feature. If it has to be phased, ship shifts/remit/day close on the cutoff first, and show a one-line note on Reports ("Reports still use midnight. Your day close uses 4:00 AM.") until the rest follows.
- **A shift still open long after the cutoff** (cutoff + 4 h) sends a reminder to the receiver: "Ben's shift on Cashier 2 is still open (11h). End it for him?" This uses the existing manager Count/close from DrawersOverview.

Scope: store-wide only. **Cut:** a per-branch cutoff (YAGNI. A branch that trades differently can come later).

---

## 3. Information architecture & entry points

```
Cashier                                   Owner / manager (receiver)
───────                                   ───────────────────────────
POS header pill  ──┐                      Home strip "2 remits to accept · ₱14,725"
Home strip  ───────┼─► Drawer (pos-sales) Push + bell (merchant_notifications: remit_pending)
                   │     ├ Start shift (sheet / inline card)        │
                   │     ├ On shift: hero, Cash in/out, Mid-shift check (X)
                   │     └ End shift & remit (full screen, 4 steps) ─┴─► Remittances (new tab, Reports → Store)
                   │            └ Remittance slip (print / share)          ├ To accept · Accepted · Pickups
                   └─ (Require shift to sell) → Start shift sheet     ├ Accept sheet / Different amount
                                                                       ├ Day close (Z summary) per business day
Manage → Cash drawers → tills + Shift & remit rules (business day,     └ History + cashier over/short
         blind count, count bills, reason threshold, who receives)
Web admin: sidebar Reports → "Cash & remits" (/admin/cash)
```

**Placement decisions**

| Entry | Who | What it shows | Tap goes to |
|---|---|---|---|
| **POS header pill** (new `ShiftPill`, left of the existing Drawer door) | cashier | `● Cashier 1 · Ana` (green dot) / `Start shift` (amber wash) / hidden in demo | Drawer, or the Start shift sheet |
| **Home strip** (extend `ShiftStatusStrip`) | cashier | "On shift · Cashier 1 · 4h 12m · ₱8,465 in drawer" (no amount when blind) / "Remitted ₱6,345 · waiting for Maria" / "Not on shift" + **Start** | Drawer |
| **Home strip** (receiver variant) | receiver | "2 remits to accept · ₱14,725", or "Friday is ready to close", or "Ben's shift is still open (11h)" | Remittances / Day close |
| **Drawer** (existing sub-screen of POS) | everyone with `pos` | The shift's home | — |
| **Reports hub → Store → "Remittances"** (new tab, beside Activity) | receiver | Inbox, Day close, history | — |
| **Manage → Cash drawers** (existing) | `store_setup` | Tills + a new **Shift & remit rules** row | Rules screen |
| **Push / bell** | receiver | "Ana remitted ₱6,345 · Short ₱120" | Remittance detail |
| **Web** `/admin/cash` | owner, managers | To accept · Shifts · Day closes · Cashiers | — |

Map rules the build must respect: a new tab goes in `workspaces.ts` (Insights or its own) + `REPORT_TABS` + `REPORTS_SECTIONS` (`hubs.test.ts` catches an orphan); the web section must be in `ADMIN_SECTION_PERMISSIONS`, because an unmapped admin section is open to every staff account.

**Who may receive / accept cash (flag):** today `canManageCash` = `store_setup`, which is too broad for a shift supervisor. Recommended: **receive = owner, full-access, `store_setup`, or `approve_requests`**, within the receiver's branch reach. This needs no new permission key (a new key means changing four registries). Revisit later with a dedicated `cash` key if owners ask for it.

---

## 4. Flows

### 4.1 Start shift

Surface: the existing ClockInCard spot on Drawer (inline card on a phone; the same card centred at 560px on a tablet). It also opens as a `DrawerSheet` from the POS pill or from "Require a shift to sell".

1. **Pick the drawer.** Tiles as today: `Cashier 1 · ₱2,000 float` (selected, coral border + wash + check), `Cashier 2 · In use · Ben`, `Bar · Zero balance`. Lands on the first free till (one tap).
2. **Starting cash.** Segmented `Type total | Count bills`.
   - **Type total:** the big `CashInput`, prefilled with the till's float. A chip under it: `✓ Usual float ₱2,000`. If the cashier changes the amount, an inline line appears: "₱50 less than the usual ₱2,000. We'll note it for the owner." No blocking.
   - **Count bills:** the same `DenominationCounter` as the close (§5). The total flows back into the field.
   - **Zero balance:** a locked ₱0 row (today's design).
3. **Handover check (new).** If the previous shift on this till left a float, the field shows "Ana left ₱2,000 in this drawer at 2:48 PM". If the count differs, the line turns warning: "You counted ₱1,950. That's ₱50 less than Ana left." The cashier starts anyway; the difference goes on both shifts and on the receiver's inbox as a note. This catches "it was short when I got it".
4. **Button:** `Start shift on Cashier 1` (lg, ink). The success state is the On-shift card, with no toast.

States: **loading** shows tile skeletons (no "every drawer is in use" flash); **all taken** shows "Every drawer is in use. Ask whoever holds one to end their shift." (existing copy); **offline** shows "You're offline. Your shift starts when this tablet reconnects." and keeps the button enabled (queued, tagged "Saved on this tablet"); **branch-locked** shows only this branch's tills; **no tills set up** = personal drawer (today's behaviour) plus the owner-only link "More than one till? Set up Cashier 1, Cashier 2…".

### 4.2 During the shift (Drawer, on shift)

Header: `ScreenHeader` "Drawer", subtitle `Cashier 1 · Ana · since 6:02 PM`, actions: `IconButton printer` = Mid-shift check.

**Ink hero (MyShiftCard, refined):**
- Chip `Cashier 1`, live dot, `6:02 PM · 4h 12m`
- Eyebrow **Should be in your drawer** → `BigAmount ₱8,465` (40pt)
- Lines in the order money moved: Starting cash ₱2,000 · Cash sales +₱9,215 · Paid in +₱200 · Paid out −₱450 · Picked up −₱2,500
- Handover box: "At close, remit ₱6,465 and keep ₱2,000 for the next shift."
- Quiet line: "₱5,830 in GCash, Maya and card. Not in the drawer."
- Actions: `Cash in / out` (secondary on ink) · `Mid-shift check` (secondary) · **`End shift & remit`** (coral, full width under them: the one primary action)

**Blind mode** (owner switch): the amount becomes `Hidden · blind count` with the eye-off line "Your owner hides the expected cash until you count." The lines keep Starting cash and the moves the cashier recorded (they did those themselves) and hide Cash sales. The handover box is replaced by "Count everything at close. We'll tell you the result after."

Below the hero: **Cash moves** list (all of them, newest first, each with who and when); then the existing **Incoming orders** (max 3) and **Sales**. The old "Today at this counter" ink hero becomes a plain `ListRow`: "Today at this counter · ₱24,615 cash · ₱9,840 GCash · details" (expands). This removes the double hero.

Footer note (small, muted): "This shift counts toward **Friday, Oct 24** · business day ends 4:00 AM".

**Cash in / out sheet** (`CashMoveSheet`, extended):
- Segmented **Pickup | Pay out | Pay in** (rename "Cash pickup" to "Pickup" on the control; the hint keeps the long form).
- "Drawer should hold ₱8,465 now" (hidden when blind).
- Amount (`CashInput`) + chips. Pickup: `Leave float · ₱6,465`, `₱1,000`, `₱2,000`, `₱5,000`. Pay out: none.
- **Pickup → "Taken by"**: avatar chips of receivers on shift in this branch + `Store safe`. Required. A pickup is a partial remit: it shows on the receiver's inbox as "Pickup · to accept" and on the slip.
- **Pay out → "What for?"** chips: `Ice` `LPG` `Rider` `Supplies` `Staff vale` + free text. ("Vale" = staff cash advance, very common. Recorded as a pay out with the staff name for now. **Flag:** proper vale tracking (deduct from payroll) is a separate feature.) With the Expenses worktree, a pay out can also be filed as an expense (`record_drawer_expense`). Offer "Also add to Expenses" ticked by default for supplies.
- `Print a slip` toggle for pickups (default on when a printer is connected).
- Button: `Record pickup ₱2,500`.

**Mid-shift check (X-reading)**: a `DrawerSheet` that shows the shift so far without closing anything: orders count, net sales, cash / each non-cash method, pay-ins/outs, pickups, expected in drawer (hidden when blind; the receiver can always see it). Buttons `Print` and `Share`. The printed header says "SHIFT SO FAR (X)", not "X-READING", unless the store is BIR-accredited (see §8).

### 4.3 End shift & remit (full-screen, 4 steps)

A pushed screen with `BackHeader` "End shift · Cashier 1", subtitle `Ana · 6:02 PM – now · counts toward Fri, Oct 24`. A **step bar** under the header: `1 Count cash · 2 GCash & cards · 3 Result · 4 Remit`, with numbered dots, the current step in ink, done steps ticked. Back steps back; leaving mid-flow asks "Stop counting? Your count is kept on this tablet." (the draft is kept per shift).

Why full screen instead of a sheet: four decisions, a keypad, and a tablet layout that needs the width. The sheet stays for a quick "just type the total" close only when the store sets "Count bills: optional" and the cashier picks Type total.

**Step 1: Count cash.** The `DenominationCounter` (§5). Segmented `Count bills | Type total` at the top (the default comes from the store rule). Running total in an ink footer (phone) or right panel (tablet): `Counted ₱8,345.00 · 47 bills · 65 coins`. Not blind: a small line under it reads "Should be ₱8,465". Blind: "We'll compare after you finish." Next: `Next: GCash & cards`.

**Step 2: GCash & cards (non-cash check).** One row per non-cash method this shift took: `GCash ₱4,210 · 14 payments`, `Maya ₱860 · 3`, `Card ₱760 · 2`. Each row has a two-way answer: **`Matches`** / **`Different`**. "Different" opens an inline amount field + "What's different?" note. "Show references" expands the list (time · ref no. · amount) so the cashier can compare against the GCash app. A single **`All match`** button at the top for the common case. "I'll leave this to the owner" (ghost) skips the step and marks it unchecked. No method had payments → the step is skipped automatically and the bar shows it ticked "None today". **Cut:** automatic matching against GCash/Maya statements.

**Step 3: Result.** A big verdict card:
- **Exact** (success wash, check icon): "Exact. Your drawer matches."
- **Short ₱120** (danger wash, warning icon) / **Over ₱40** (warning wash, info icon)
- Three lines in tabular figures: Should be ₱8,465 · You counted ₱8,345 · Difference −₱120
- `Recount` (secondary, goes back to Step 1 keeping the count) is offered first on any Short.
- **What happened?** (required when |difference| > the store's threshold, default ₱20): chips `Wrong sukli (change)` · `Pay out not recorded` · `Counting mistake` · `Customer paid less` · `Not sure` + optional note. Over gets `Customer left extra` · `Pay in not recorded` · `Counting mistake` · `Not sure`.
- **Handover math** (plain): "Keep ₱2,000 for the next shift. **Remit ₱6,345.**" Zero balance: "Remit all ₱8,345. This drawer ends empty." The float to keep is editable (stepper chip "Keep ₱2,000 · change") for the night the next shift needs more coins.
- Button: `Next: Remit ₱6,345`.

**Step 4: Remit.** "Who is receiving it?": radio rows with avatar, name, role and presence (`On shift now` / `Last seen 2h ago`), drawn from receivers in this branch; then `Store safe (drop safe)`. Below, **How** (segmented):
- **`Send to her phone`** (default): Maria gets a push; the cashier is done.
- **`PIN here now`**: an inline PIN pad (4–6 dots, own keypad); Maria types her PIN on this tablet and the remittance is accepted on the spot. Reuses the approver PIN service (lockouts, rate limits). Wrong PIN: "That PIN didn't work. 2 tries left." Locked: "Maria's PIN is locked for 15 minutes. Send to her phone instead."
- Safe: "Who will open the safe?" picks the receiver who accepts later.

Button: **`Remit ₱6,345 & end shift`**. This writes the closing count, closes the shift and creates the remittance in one go. Then the slip screen replaces the flow (back goes to the Drawer, not into the steps).

**Remittance slip** (screen + printable): paper-styled card (white, zig-zag top and bottom edges, monospace figures):

```
        LOLY'S CAFÉ · Main branch
          REMITTANCE SLIP  #R-0241
Business day        Fri, Oct 24, 2026
Drawer              Cashier 1
Cashier             Ana Reyes
Shift               6:02 PM Fri – 2:48 AM Sat
--------------------------------------------
Starting cash                   2,000.00
Cash sales                      9,215.00
Paid in / Paid out          +200 / −450.00
Pickups (Maria 9:40 PM)        −2,500.00
Should be in drawer             8,465.00
Counted                         8,345.00
SHORT                             120.00
  Wrong sukli: "gave ₱100 extra to T4"
Float kept                      2,000.00
REMITTED                        6,345.00
--------------------------------------------
GCash  14   4,210.00   ✓ matches
Maya    3     860.00   ✓ matches
Card    2     760.00   ✓ matches
--------------------------------------------
Bills  ₱1000×4 ₱500×3 ₱100×7 ₱50×6 ₱20×9
Coins  ₱10×12 ₱5×8 ₱1×23 25¢×4
--------------------------------------------
Remitted by ____________  Received by ____________
          Waiting for Maria Santos
   Not an official receipt. For store use.
```

Status banner above the slip: "**Waiting for Maria to accept.** She got a notification." / "**Accepted by Maria** with PIN, 2:51 AM". Buttons: `Print` (thermal 58/80 mm through the receipt block engine), `Share` (image), `Done`. Copy at the foot: "Your shift is closed. Salamat, Ana!" (the one warm Taglish touch).

### 4.4 Receiving: Remittances inbox (owner/manager)

`ScreenHeader` "Remittances", subtitle `Main branch · Friday, Oct 24` (branch chip for store-wide owners: `All branches ▾`). Toolbar: segmented **To accept (2) | Accepted | Pickups**.

- **To accept**: `NeedsYouCard`-style rows. Each row has an avatar, "Ana · Cashier 1", "₱6,345 · 2:51 AM", a result pill (`Short ₱120` danger / `Exact` success / `Over ₱20` warning) and an **Accept** button (first row primary, the rest secondary). Tapping the row opens the detail = the slip + reason + who counted.
- **Accept sheet**: "Did you receive ₱6,345 from Ana?" → **`Yes, I received ₱6,345`** (primary) / `I got a different amount` → amount field → "₱6,300 received. ₱45 less than the slip. Note?" That records a second difference on the receiving side, so the two people's records never disagree silently. Optional photo.
- **Accepted**: who accepted, when, how (phone / PIN / safe).
- **Pickups**: pickups taken during shifts, each to be accepted the same way (one tap: "Received ₱2,500").
- Empty: Owl `idle`, "All remittances are in. Nothing to accept." Offline: the existing offline notice; Accept is disabled with "Accepting needs a connection".
- Footer card: **Day close** for the business day: `Close Friday →` (disabled with a reason until every shift on the day has ended).

### 4.5 Day close (Z summary)

Pushed screen, `BackHeader` "Close Friday", subtitle `Oct 24 · Fri 4:00 AM – Sat 3:59 AM · Main branch`.

1. **Before you close** checklist (a card with tick rows; each unmet row has a one-tap fix):
   - ✓ 3 shifts ended / ✗ "Ben is still on Cashier 2" → `End for him` (manager count)
   - ✓ 3 remittances accepted / ! "1 waiting" → `Review`
   - ✓ GCash & cards checked / ! "GCash ₱50 different on Cashier 2" → `Look`
   - Unmet rows don't block closing, apart from open shifts (a hard block: an open shift has no count). The rest give a "Close anyway?" confirm that notes what was skipped.
2. **Ink hero**: eyebrow "Cash to deposit" → `₱19,850`. Lines: Net sales ₱41,220 · Cash sales ₱24,615 · GCash ₱9,840 · Maya ₱2,150 · Card ₱4,615 · Pay outs −₱1,250 · Expenses from drawer −₱600 · Short/over −₱100 · Floats kept for tomorrow ₱4,000. Net sales and methods come from `sales-model.ts` / `payment-buckets.ts`, the one definition, never a new formula.
3. **By shift** (rows): Ana · Cashier 1 · remitted ₱6,345 · Short ₱120; Ben · Cashier 2 · ₱8,380 · Exact; Carlo · morning · ₱5,125 · Over ₱5.
4. **Deposit**: segmented `Bank deposit | Kept in safe | Split`; amount (prefilled ₱19,850), bank/reference text, `Add deposit slip photo`. A deposit different from the expected amount says so: "₱150 less than cash to deposit."
5. Buttons: **`Close Friday`** (primary). After closing: `Print Z summary` · `Share` · `Reopen` (owner only, logs who and why).

After close: late order edits on a closed day appear on the next day's close as "Changed after Friday was closed: 1 order, −₱80". (Flag: needs a small after-close ledger read.)

**History** (same tab, below the inbox, or `Day closes` segment on web): list of business days, each showing cash deposited, total over/short and a closed-by line. **Cashier over/short**: per cashier, last 14 shifts as a diverging bar strip around zero, plus "3 short in 14 shifts · −₱260 total". Phrased as a pattern, never a verdict ("Ana has been short 3 times this fortnight").

### 4.6 Settings: Shift & remit rules (Manage → Cash drawers)

`BackHeader` "Shift & remit rules". Sections:
- **Business day ends at** — chips + live preview band (§2).
- **Counting** — `Count bills at end of shift`: Required / Optional (default Optional). `Blind count`: hide expected cash from cashiers (default Off; recommended On, which the hint says).
- **Short & over** — "Ask for a reason when the difference is more than" `₱20` stepper.
- **Selling** — `Require a shift to sell` (default Off). When On, the first Charge without a shift opens Start shift, then continues the sale.
- **Receiving cash** — read-only list of who can accept remittances (derived from permissions) with a link to Team.
- **Tills** — the existing drawer list and standard floats.

### 4.7 Web admin: `/admin/cash` ("Cash & remits", sidebar section Reports)

Page title "Cash & remits", subtitle "Shifts, remittances and day closes · business day ends 4:00 AM". The header has a branch picker, a business-day stepper ("‹ Fri, Oct 24 ›") and `Export`. Tabs: **To accept (2)** · **Shifts** · **Day closes** · **Cashiers**.
- Top row: four KPI tiles that ARE the point: Cash to deposit · Remitted & accepted · Waiting · Over/short.
- **Shifts** table: cashier, drawer, start–end, cash sales, non-cash, moves, counted, result pill, remit status, receiver. Row click opens a right sheet with the slip.
- **Day closes**: list + detail with the same content as the app; `Close day` works from the web too.
- **Cashiers**: over/short trend per cashier (diverging bars) with a 30/90-day switch.
- Settings card (owner): business day cutoff, blind count, threshold, same rules as the app (one source).
Built from the admin shell tokens (`wn-ink`, `wn-canvas`, `wn-line`, `wn-stone`, `wn-coral`), Geist, `rounded-2xl bg-white ring-1 ring-border` panels, pill buttons.

---

## 5. Interaction details

### DenominationCounter (new, shared by start and close)
- **PH denominations, two groups.** Bills: ₱1000 · ₱500 · ₱200 · ₱100 · ₱50 · ₱20. Coins: ₱20 · ₱10 · ₱5 · ₱1 · 25¢, with `More coins` revealing 5¢ / 1¢. The ₱20 bill and ₱20 coin stay separate rows because they are counted from different trays.
- **Row** (min 56pt tall): denomination chip (bill = wide rounded rect tinted per value; coin = circle) · `−` · count (tappable, tabular, 22pt) · `+` · subtotal (right-aligned, muted until > 0). `−`/`+` are 48×48 (56 on tablet). Holding `+` repeats every 120 ms after a 400 ms delay.
- **Keypad focus:** tapping a count focuses the row (coral 1.5px border, accent wash) and points the keypad at it. Phone: the keypad docks under the list (the Expenses `ExpenseKeypad`, digits only, `00` kept for "100 coins"). Tablet: the list is on the left (scrolls) and keypad + total on the right, always visible. After typing, `Next ↓` (keypad key replacing `00` when focused) moves to the next row. That way a full count is digits + Next, with no hunting.
- **Loose coins by total:** a last row `Coins I counted by total ₱___` for cashiers who weigh or roll coins. When used, the coin rows collapse to "Counted by total".
- **Running total** updates on every key: `accessibilityLiveRegion="polite"`, announced at most once per 1.5 s.
- **No haptics relied on:** every press gives visual feedback (key press colour `separator`, the total ticks). Haptics can be added later but carry no meaning.
- Money is integer centavos end to end (25¢ rows). Counts persist per shift as `{denomination: count}` for the slip and audit.

### Keypad
Generalise `components/expenses/ExpenseKeypad.tsx` into `components/Keypad.tsx` (`mode: "amount" | "count" | "pin"`). Amount: today's behaviour (`00`, long-press `00` → centavos, long-press ⌫ → clear). Count: digits, ⌫, `Next`. PIN: digits, ⌫, no `00`, dots above, never echoes digits.

### Sheets
`DrawerSheet` as is: docked on a phone, centred on a tablet (`useCenteredDialog`), never dismissed mid-write, closeLabel. Flat white sheet, the grabber, 24/800 title, Cancel on the right.

### Feedback
No toasts for the happy path. The next state is the confirmation (on-shift card, slip). Errors appear inline under the control in `sheetText.error`. A write that fails keeps the user's input and says what to do: "Couldn't end your shift. Check the connection and tap Remit again. Your count is saved."

---

## 6. States matrix

| Screen | Empty | Loading | Offline | Error | Blind | Multi-drawer | Branch-locked staff |
|---|---|---|---|---|---|---|---|
| Start shift | No tills → personal drawer | Tile skeletons; button disabled | Queue + "Saved on this tablet" chip | Inline, keep input | n/a | Tiles, first free preselected, taken shown with holder | Own branch's tills only |
| On shift | No sales: "Nothing rung up yet" | "Adding up your sales…" in the hero (never ₱0) | Offline notice + "Sales rung up offline are counted" | "Couldn't read payments taken here (…)" line in hero | Amount hidden, sales line hidden | Chip names the till | Own branch |
| Cash in/out | — | Expected "—" and the check vs expected is skipped | Queued with chip | Inline (e.g. "More than this drawer should hold") | No "should hold" line; the over-limit check still runs server-side | Receivers from this till's branch | Same |
| End shift flow | Step 2 auto-skipped when no non-cash | Expected pending → Result shows "Waiting for today's sales to add up…" and Remit is disabled | Steps 1–3 work; Remit queues ("We'll send it when online"); PIN option disabled with reason | Keep count draft; retry | Expected hidden on steps 1–2, revealed on 3 | — | Receivers in own branch |
| Slip | — | — | "Not sent yet" banner | Retry | Slip always shows expected (the count is done) | — | — |
| Remittances inbox | Owl idle, "Nothing to accept" | Row skeletons | Read cached; Accept disabled | ErrorState with Retry | Receivers always see everything | Rows per till | Branch manager sees own branch; owner sees all, with branch chip |
| Day close | "No shifts on Friday" → can still record a deposit of ₱0? No, show "Nothing to close" | Hero "Adding up Friday…" | Read-only cached, Close disabled | ErrorState | n/a | Rows per shift | Per branch; store-wide owner closes each branch (or "Close all branches" when all are ready) |
| Rules | Defaults shown | — | Save disabled | Inline | — | — | Hidden (store_setup only) |

Demo mode: every write shows `DEMO_READONLY_MESSAGE`; the screens render sample data.

---

## 7. Copy deck (key strings)

| Where | Copy |
|---|---|
| Start card | **Start your shift** · "Pick your drawer and count the cash in it before your first sale." |
| Float confirm | "✓ Usual float ₱2,000" · "₱50 less than the usual ₱2,000. We'll note it for the owner." |
| Handover check | "Ana left ₱2,000 in this drawer at 2:48 PM." · "You counted ₱1,950. That's ₱50 less than Ana left." |
| Hero | "Should be in your drawer" · "At close, remit ₱6,465 and keep ₱2,000 for the next shift." |
| Blind | "Hidden · blind count" · "Count everything at close. We'll tell you the result after." |
| Primary | **End shift & remit** |
| Step bar | Count cash · GCash & cards · Result · Remit |
| Count hint | "Count everything in the drawer, float included." |
| Verdicts | "Exact. Your drawer matches." · "Short ₱120" · "Over ₱40" · "Recount once before you remit." |
| Reasons | Wrong sukli (change) · Pay out not recorded · Counting mistake · Customer paid less · Not sure |
| Remit | "Who is receiving it?" · "Send to her phone" · "PIN here now" · **Remit ₱6,345 & end shift** |
| Slip | "Waiting for Maria to accept. She got a notification." · "Your shift is closed. Salamat, Ana!" · "Not an official receipt. For store use." |
| Push | "Ana remitted ₱6,345 · Short ₱120" |
| Accept | "Did you receive ₱6,345 from Ana?" · **Yes, I received ₱6,345** · "I got a different amount" |
| Day close | **Close Friday** · "Cash to deposit" · "Ben is still on Cashier 2" → "End for him" |
| Setting | "Business day ends at" · "Sales from Fri 4:00 AM until Sat 3:59 AM count as Friday." · "A shift belongs to the day it started." · "Starts from Saturday, Oct 25. Past days keep their dates." |

Words avoided: variance, reconciliation, tender, Z-report (unless accredited), discrepancy.

---

## 8. Compliance flag: X / Z readings

PH cashiers know "X-reading" and "Z-reading" from BIR-accredited POS machines, and `store_tax_profiles` already holds a `pos_ptu_no`. A BIR Z-reading has rules (accumulated grand total, reset counter, sequential numbering, non-editable). **Unless the platform is accredited for that store, our printouts must not be titled X-READING / Z-READING.** Use "Shift so far (X)" and "Day close (Z summary)" in the UI, and print "Not an official receipt / Not a BIR Z-reading" on every slip. Revisit with whoever owns the BIR work (the gov-discount/VAT receipts track).

---

## 9. Accessibility

- Targets ≥ 48pt (steppers 48, 56 on tablet; keypad keys 54–64 per the `sheetSizing` rule); 44pt hit slop on small ink-card links.
- `BigAmount` gives spoken amounts ("eight thousand four hundred sixty-five pesos"); every denomination row reads "₱100 bills, 7, seven hundred pesos". Steppers are labelled "Add one ₱100 bill" / "Remove one…".
- Verdicts are never colour alone: word + icon + tint. Pills meet AA (`statusPending.text` on `warningLight`, `danger` on `dangerLight`).
- Meta text uses `textMuted #6E685E` (AA on white and the canvas), not `textSecondary`, wherever it carries meaning (expected, handover, reasons).
- Live regions: running total (polite, throttled), verdict (polite, once).
- Font scaling: amounts `adjustsFontSizeToFit`; rows wrap; the step bar collapses to "Step 2 of 4 · GCash & cards" at large text sizes.
- The PIN pad never echoes digits and announces "3 of 6 entered".
- Landscape tablet and portrait phone are both first-class; the flow never needs the OS keyboard except for notes.

---

## 10. Components: reuse vs build

**Reuse as is:** `ScreenHeader`, `BackHeader`, `IconButton`, `Button` (primary/secondary/ghost/danger, sm/md/lg), `SegmentedControl`, `ListRow`, `SectionHeader`, `EmptyState`, `ErrorState`, `LoadingState`, `OfflineOrdersNotice`, `DrawerSheet` + `CashInput` + `AmountChips` + `sheetText`, `StaffAvatar`, `Icon` (has `drawer`, `payments`, `printer`, `check`, `warning`, `info`, `clock`, `export`), `Owl` (empty states), `BranchContextBar`.

**Reuse from feat/expenses (promote to shared):** `BigAmount`, `ExpenseKeypad` → `Keypad` (modes), `NeedsYouCard` pattern → inbox rows, `heroInkPositive/Negative` tokens (needed on the ink hero for Over/Short).

**Extend:** `ClockInCard` (count mode, usual-float chip, handover check), `MyShiftCard` (blind, X-reading, single primary, business-day note), `CashMoveSheet` (Taken by, reason chips, print slip, also-an-expense), `DrawersOverview` (remit status per drawer, "End for him"), `ShiftStatusStrip` (cashier + receiver variants), `cash-drawers.tsx` (Rules row), receipt engine (`receipt-layout.ts`, both copies + parity test) with a slip layout, `merchant_notifications` kind `remit_pending` (+ check constraint, wording both sides, push route).

**New:** `ShiftPill` (POS header) · `DenominationCounter` + `DenominationRow` + `DenominationChip` · `CountModeSwitch` · `RemitFlow` screen + `StepBar` · `NonCashCheck` (rows with Matches/Different + references) · `VerdictCard` · `ReasonChips` · `RemitToPicker` · `ManagerPinPad` · `RemitSlip` (screen + print) · `remittances.tsx` tab + `AcceptRemitSheet` · `day-close.tsx` + `DayCloseChecklist` + `DepositSheet` · `OverShortStrip` (diverging bars) · `BusinessDayPicker` + `BusinessDayPreview` · `XReadingSheet` · web `/admin/cash` (page, tabs, shifts table, slip sheet, day close, cashier trend, rules card).

---

## 11. Scope: cut, add, defer

**Cut / defer**
- Per-branch business-day cutoff (store-wide only).
- Automatic GCash/Maya statement matching (totals + reference list, cashier ticks).
- Bank deposit verification (photo + reference only).
- Shared drawers (two cashiers on one till). One holder per till stays.
- Official BIR X/Z readings (§8).
- Payroll-linked vale (record as a pay out with a name for now).
- A dedicated `cash` permission key (use owner/full/store_setup/approve_requests).

**Add (not in the draft, worth it)**
- **Handover check at start** (§4.1): catches "short when I got it", the most common counter dispute.
- **Pickups as partial remits** with a "Taken by" person and accept: today a pickup has no receiver, so cash can vanish between drawer and owner.
- **"I got a different amount"** on accept: the receiver's own variance, so the two records never silently disagree.
- **Require a shift to sell** (opt-in).
- **Stale shift reminder** (cutoff + 4 h).
- **Count draft kept per shift** (a call or a rush mid-count must not lose 40 taps).
- **One hero per Drawer screen** (fold "Today at this counter" into a row).

**Engineering flags for the plan**
- Platform Supabase first: shifts, counts, remittances, day closes are platform tables; Convex/tenant-DB stores need sales totals through `resolveOrderBackend`, and the day-close sales figures for platform come from the report RPCs (bounded, ≤93 days, `statement_timeout` on probes).
- Remit = one atomic write (close shift + count + remittance). Acceptance = CAS `pending → accepted`, receiver-only, and RLS-tested as `authenticated` (zero-row refusals must be surfaced).
- Day close is a frozen snapshot (like the ledger's frozen cost), so later edits never rewrite a closed day; they surface as "after close".
