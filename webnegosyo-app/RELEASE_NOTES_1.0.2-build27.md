# WebNegosyo Admin — 1.0.2 (build 27)

Covers everything merged since build 24 (`8b0a55b`, 27 Jul 2026): 186 files, ~27k lines.
Android ships the same code as versionCode 7 (APK).

---

## "What's New" (App Store Connect — recommended)

```
This update makes the app work for merchants who run more than one branch — and turns
the Register into a place where you can fix an order after it has been rung up.

Multiple branches
• Owners now land on a Portfolio view showing every branch side by side, then tap into
  any one branch to work in it.
• Branch managers and branch staff see only their own branch — its orders, its stock,
  its takings. Nothing from the other branches.
• New-order alerts now ring only the branch that has to act on the order.
• Compare branches on five measures — takings, average bill, orders per trading hour,
  food cost and stock variance — each with one clear next action.

Order editing on the Register
• Edit an order after it has been placed: change quantities, add or remove items, then
  settle the difference in cash or record a refund.
• Every order now shows its payment history and what changed on each edit.
• The kitchen is protected — once a ticket has been started, it can no longer be edited.
• Stock moves with the edit, so your shelf stays correct.

Inventory in your pocket
• Record stock, run a full stock count and finish it at the shelf.
• Move stock between branches: compose a transfer, send it, and count it in at the
  other end.
• A daily inventory report with the day's takings, food cost percentage and where the
  count stopped.

Products
• Choose what each branch sells, and set each branch's own prices — the Register rings
  up the branch's price.
• Add and edit products straight from the branch products screen.
• Filter the product list by category, availability and stock level.
• Day-by-day product analytics with date windows and quick filter presets.

Payments
• Manage your payment methods from the app.

Fixes
• Fixed a crash when moving between tabs after switching branches.
• Fixed platform staff accidentally receiving a store's order alerts.
• Product search no longer stalls while you type.
• General stability and performance improvements.
```

Character count: ~1,830 (App Store limit 4,000).

## Shorter alternative

```
• Multi-branch: owners get a Portfolio view across every branch; branch staff see only
  their own. Order alerts ring only the branch that has to act.
• Branch comparison on five measures — takings, average bill, orders per trading hour,
  food cost and stock variance — each with one next action.
• Edit a placed order on the Register and settle the difference; payment and edit
  history on every order. Started tickets stay locked.
• Inventory: stock counts at the shelf, branch-to-branch transfers, and a daily report
  with food cost percentage.
• Per-branch menus and prices, product add/edit and filters, and day-by-day product
  analytics.
• Manage payment methods in-app.
• Fixed a tab-switch crash, stray order alerts for platform staff, and slow product
  search.
```

---

## Google Play "What's new" (500-char limit)

```
Multi-branch support: owners get a Portfolio across every branch, branch staff see only
their own, and order alerts ring only the branch that must act. Edit a placed order on
the Register and settle the difference. Run stock counts, move stock between branches,
and read a daily report with food cost %. Per-branch menus and prices. Day-by-day
product analytics. Fixes: tab-switch crash, stray order alerts, slow product search.
```

---

## What actually changed (engineering summary)

### Multi-branch is the headline

- **Session scope.** `session-resolve` now carries an outlet, and `use-branch-scope`
  composes the *account* scope (what you're allowed to see) with a *viewing* selection
  (what you've drilled into) — narrow-only, so a drill-down can never widen access.
- **Owner surfaces.** New Portfolio screen and a Business view; a multi-branch owner
  lands on the portfolio with a way back out (`use-branch-landing`,
  `use-portfolio-audience`, `branch-context-store`).
- **Reads and writes are narrowed.** Order reads are scoped to the account's branch and
  outlet/order writes are guarded against the wrong branch. A branch manager sees no
  other branch anywhere — directory and Business view included.
- **Push.** Order notifications target the order's branch only.
- **Branch management redesign.** Five KPIs computed from order history, ranked per
  *trading hour*, resolving to exactly one verdict per branch in fix-order.

### Order editing on the register

- Load a placed order back into the cart, compute the balance, revise it, and record
  the settlement through the platform backend (`pos-stock-revision`, revise/payment
  write path).
- Non-item charges (service charge, delivery) carry across an edit; an edited line
  totals from the price actually stored.
- Edits are refused once the kitchen has started — enforced on the write paths, not
  just the UI.
- Payments and edit-history cards on the order detail.

### Inventory on the phone

- Shelf screen scoped to one branch, stock recording, and a start/finish stock-count
  panel.
- Stock transfers end to end: view rules, service, compose, dispatch, and count-in.
- Daily inventory report with takings, food cost percentage (only stated when the data
  supports it) and where a count stopped early. Transfer movement reasons are accounted
  for so branches reconcile separately rather than as one stream.

### Products and analytics

- Per-branch listings and prices with whole-row writes that don't clobber branch prices;
  the register rings the branch's own price.
- Add/edit products from the branch products screen; filter by category, status, stock.
- Daily per-product analytics with filters, presets and deltas, memoised so search
  doesn't recompute analytics on every keystroke.

### Notable fixes

- Tab navigator stale-state crash (stop replacing into the merchant tab navigator).
- Superadmin impersonation no longer subscribes to a store's order alerts.
- Removed the subscription/billing pause gate from the merchant app.
- A stock write no longer resolves the same identity three times.

---

## Submission form notes

- **Version:** 1.0.2, **build 27** (iOS) / **versionCode 7** (Android APK).
  1.0.1 was approved and its train is CLOSED — Apple rejects any further 1.0.1
  build ("Invalid Pre-Release Train"), which is why this release is 1.0.2.
- **Export compliance:** unchanged — `ITSAppUsesNonExemptEncryption: false`.
- **Demo account:** unchanged — Demo Mode is reachable from the sign-in screen with no
  credentials. Note the round-2 caveat still applies: account deletion cannot be
  exercised in Demo Mode, so reviewer credentials for a real account are needed if
  5.1.1(v) is re-raised.
- **Sign-up:** still absent (guideline 3.1.1 fix from round 3) — sign-in + demo only.
- Superadmin/platform-console work in this release is internal and deliberately left
  out of the public notes.
