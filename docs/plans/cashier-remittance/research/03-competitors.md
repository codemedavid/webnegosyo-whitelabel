# 03 — Competitor research: cashier shift & remittance (cash management)

Researched 2026-10-26 from vendor help centers, developer docs, changelogs and vendor community forums. Every claim has a citation. Where a vendor's docs don't cover a point, the report says "not documented" rather than guessing.

**Method caveat:** searches for Reddit threads (r/restaurateur, r/smallbusiness) turned up none in the index, so the complaints section draws on vendor community forums (Square Seller Community, Toast Community), Capterra/Trustpilot reviews, and Square feature-request boards. These are first-hand merchant complaints, but they are not Reddit.

---

## 1. Per-vendor findings

### 1.1 Square (POS + Square for Restaurants)

**Business day / cutoff**
- There are three separate "day" concepts, and merchants confuse them:
  1. **Close of day** (Balance → Transfer settings) decides how *payments are grouped into bank transfers*. The default is midnight. Square recommends setting it "one hour after your actual closing time"; setting it after midnight delays the transfer one day. https://squareup.com/help/au/article/5439
  2. **Reporting hours** (Reports → Settings → Reporting Hours) is a named start/end window. *"The start time will determine the calendar day that sales will be attributed to."* This is what fixes a bar that closes at 2 AM. https://squareup.com/help/article/7192
  3. The Square for Restaurants **Close of Day report** starts at the Reporting Day start time, or at business hours if none is set. https://square.com/help/us/en/article/6594-end-of-day-reporting-with-square-for-restaurants
- Complaint: a bar's midnight–2 AM sales landed on the next day's report. https://community.squareup.com/t5/Questions-How-To/How-do-I-change-the-daily-sales-reports-if-my-close-of-day-is/m-p/30387
- **Auto-close:** drawers open more than 30 days with at least 7 days of inactivity are ended automatically. There is no nightly auto-close of drawers. https://squareup.com/help/us/en/article/8344-start-and-end-a-cash-drawer-session

**Lifecycle**
- Cash Management is a free add-on, turned on per device or per "mode" (a device group). It works on tablets, Terminal, Register and Handheld, **not on phones**. It has a default starting cash setting and an email-report preference. https://squareup.com/help/us/en/article/5152
- **Start drawer:** More → Reports → Current Drawer → Starting Cash → Start Drawer, with an optional description. A drawer can be started only from the POS, never from the Dashboard. https://squareup.com/help/us/en/article/8344-start-and-end-a-cash-drawer-session
- **Paid In/Out:** amount plus a free-text description, then pick In or Out. Each entry shows in drawer history with the running total. There are no preset reasons. (same source)
- Drawers are tracked **per device**. Cash taken on a device with no drawer never shows in any drawer report. https://community.squareup.com/t5/Archived-Discussions-Read-Only/Expected-Cash-In-Drawer-Amount/m-p/92410
- Permissions: "Open Cash Drawer Outside of a Transaction" + "View Cash Drawer Reporting" (start/end + see expected). A separate "View Expected Amount in Cash Drawer" permission also exists. https://square.com/help/us/en/article/5822

**Closing**
- Square separates **End** (stop the session) from **Close** (record the actual count). You type a single total (no denomination counter) and an optional description. A drawer can also be ended remotely from the Dashboard, but after that no Pay In/Out corrections are possible. https://squareup.com/help/us/en/article/8344-start-and-end-a-cash-drawer-session
- Feature requests for denomination counting and blind counting go back years. One is marked "Not currently planned". https://community.squareup.com/t5/Feature-Requests/Register-Count-by-Denomination-Cash-Drawer/idi-p/680746 · https://community.squareup.com/t5/Feature-Requests/Cash-counting-function-for-closing-cash-drawer/idi-p/799830
- No variance threshold, no required reason, no manager approval.

**Reports**
- Drawer report: starting cash, cash sales, cash refunds, paid in/out, expected. It is emailed at end. Dashboard: Reports → Payments → Cash drawers, with addable columns (Paid In, Paid Out, Device, Location). It **cannot be exported or printed from the Dashboard**. https://squareup.com/help/us/en/article/8358-view-cash-drawer-reports
- Square for Restaurants **Close of Day**: a preview lets the manager close open checks and drawers, adjust tips and clock people out, then run and print. Requirements are configurable per location (close checks / adjust tips / total cash drawers / clock out). **Overriding a requirement needs the owner passcode.** Each team member runs a **Shift Report** showing "card tips and cash owed to the house" before clocking out. https://square.com/help/us/en/article/6594-end-of-day-reporting-with-square-for-restaurants

**Handover:** there is no deposit or safe workflow.

---

### 1.2 Toast (restaurant leader; best-documented)

**Business day / cutoff**
- `closeoutHour` is 0–12 (midnight–noon), default **4 AM**, in the restaurant's time zone. At the cutoff Toast auto-closes paid checks, auto clocks-out employees, auto-captures card batches, and **auto-closes open cash drawers**. Unpaid checks stay open. https://support.toasttab.com/en/article/Close-Out-Day-Z-Report-Auto-Capture · https://doc.toasttab.com/doc/devguide/apiRestaurantBusinessDate.html
- Only Toast Support can change it. For a 24-hour store, "pick your slowest time of day" between 12 and 7 AM. https://intercom.help/toast-central/en/articles/9306621-best-practices-for-24-hour-operations
- The new drawer experience offers two modes. **Automatic reset:** the drawer resets to the default starting balance and auto-closes at 4 AM. **Manual reset:** the cashier is prompted for a starting balance and the drawer does **not** auto-close overnight. https://support.toasttab.com/en/article/Use-Cash-Drawers-New-Experience

**Lifecycle**
- Drawer states: **Open/Active** (takes cash sales), **Paused** ("Count this drawer later": no cash sales, but add/remove cash is still allowed, tagged "TO BE COUNTED"), **Closed** (counted). Closing one drawer auto-creates the next active drawer. https://support.toasttab.com/en/article/Use-Cash-Drawers-New-Experience
- Cash-in types: Add cash, **Cash collected from server**. Cash-out types (a required reason): **Cash out, Payout** (goods/services), **Tip out**, **Cash drop** (to a back-office safe). **No Sale** opens the drawer with optional required reasons, and each use is logged to the Sales Exception report. https://doc.toasttab.com/doc/platformguide/adminCashDrawers.html
- Each device can have **Primary/Secondary** drawers. **Cash drawer lockdown** ("Lock drawer to me") puts a "LOCKED TO ME" banner on the drawer, and the employee must close it during their shift review before they can clock out. A manager can override. https://doc.toasttab.com/doc/platformguide/adminCashDrawerLockdown.html
- **Server banking / cash in hand:** servers without a drawer hold cash. Shift review computes what the server owes the house versus what the house owes in card tips, in two layouts: "Pay or Collect" and "Pay and Collect". https://support.toasttab.com/en/article/Shift-Review-Overview
- Drawers run only on Toast Flex terminals, not handhelds.

**Closing**
- **Denomination count** (the POS totals it), or "Quick Cash" presets labelled "Includes starting balance". https://support.toasttab.com/en/article/Use-Cash-Drawers-New-Experience
- **Blind vs Full** permissions: *3.17 Cash Drawers (Blind)* hides each drawer's expected balance, so the employee "has to enter an actual closing cash balance without knowledge of the expected closing cash balance". *3.18 Cash Drawers (Full)* shows it. https://doc.toasttab.com/doc/platformguide/adminCashDrawers.html
- **Reopen / adjust:** "Adjust closing entries" puts a closed drawer back to Paused for edits and re-closing. Toast Web offers "Update Entries" for the current business week; older weeks need Customer Care. https://support.toasttab.com/en/article/Cash-Drawer-Reports-Overview
- No numeric variance threshold or required variance reason is documented.

**Reports**
- **Close Out Day** (permission 3.16) is a checklist: close checks → scheduled pickups → clock out → close drawers → create deposits → capture payments → print Z → auto-resolve → End Day. "Clock out all" is available only once no checks or drawers are open. https://doc.toasttab.com/doc/platformguide/platformCloseOutDayOverview.html
- **Z report** = one business day, configurable (net sales, discounts/voids, cash balance, deposit summary). Printing it does **not** turn the day over and can be done any time. https://support.toasttab.com/en/article/Close-Out-Day-Z-Report-Auto-Capture
- **Drawer History:** overage/shortage = expected closeout − actual, with expected including the starting float. It lists the employees who had access and who last closed. https://support.toasttab.com/en/article/Cash-Drawer-Reports-Overview

**Handover / deposit**
- Closed drawers → **Create deposit** (count bills or enter a total) → print the closed-drawer report. The deposit should **exclude starting balances**, which stay in the drawer. A forgotten deposit can be added later in Toast Web. Deposit variance = expected deposit − actual, which is compared against bank slips. https://support.toasttab.com/article/Deposits-Adding-Actual-Cash-Amounts

**Tips:** Tip Out from the drawer, declared cash tips in shift review (negative declarations allowed for tipping out bussers), and non-cash tips paid from the drawer or via payroll. https://support.toasttab.com/en/article/Shift-Review-Overview

---

### 1.3 Lightspeed Restaurant (K-Series and L-Series)

**Business day:** K-Series uses a **sales period** that a shift manager (or the "User can open and close shifts" permission) opens. **No orders are accepted before it is opened.** Closing it "ends the business day and generates POS reports". Before closing, every order must be paid, every other user clocked out, and every device's drawer counted and closed. Optional "shift impressions" (weather, a rating) are recorded at open and close. https://k-series-support.lightspeedhq.com/hc/articles/360051071413

**Lifecycle**
- **Physical cash drawers** are assigned to devices and users. A **user bank/wallet** is a virtual per-user drawer used when the device has no drawer. https://k-series-support.lightspeedhq.com/hc/articles/360050436394
- The per-drawer **Counting** setting is **Disabled** (always opens at the default float), **Enabled** (count or skip), or **Mandatory**. https://k-series-support.lightspeedhq.com/hc/articles/1260804606710
- Add/remove cash takes an amount plus a **reason**. The first eligible user to reach the Register is prompted to count.

**Closing:** counting is **by denomination: you enter the number of coins/notes, not the value**. The drawer report (over/short, each add/remove with reason, cash sales) **prints automatically on close**. Tip declaration happens at sales-period close. No blind setting is documented for K-Series. https://k-series-support.lightspeedhq.com/hc/articles/360050436394

**Reports:** the L-Series (Restaurant POS) offers **X = End of Shift** (from the last Z to now, *does not reset*) and **Z = End of Day** (*resets* cash drawer data), each for a Cash Drawer or a User Wallet. They print or save to Photos. https://resto-support.lightspeedhq.com/hc/en-us/articles/226306687 · The K-Series Back Office Shift report nests the Shift (whole day), User (clock-in→out) and Drawer reports. The Cash drawer report "helps calculate the cash to deposit at the bank, after deducting tips and change". https://k-series-support.lightspeedhq.com/hc/articles/4403156148251

---

### 1.4 Clover

- **Business day:** the closeout time (batch auto-closeout runs in a 50-minute window) is tied to hours of operation. It **can change only once every 7 days** and takes up to 12 hours to apply. https://www.clover.com/en-US/help/understand-closeout-settings · The reporting period can end after midnight ("1 am rather than 12 am"). https://www.tylbynatwest.com/help-and-support/clover/viewing-transactions-and-reporting
- **Cash Log** app: every cash event (date, event type, amount, reason, employee) is filterable by employee, event or device on the web dashboard. It records only from install onward. https://www.clover.com/en-US/help/run-cash-log-report
- **Shifts** app: clock in/out with a **"I will hold cash sales this shift" checkbox** instead of a starting drawer count. https://www.eu.clover.com/en-gb/help/shifts-app
- Native start/end-of-shift drawer counting is weak. Clover's own blog points merchants to the third-party **Cash Track** app (starting count per register/employee, employee count vs manager count vs shift report, emailed shift reports). https://blog.clover.com/smart-cash-management-tips-for-small-businesses · A community thread asks how to record a starting till and a safe drop, and the only answer is the Cash Log. https://community.clover.com/questions/28971/how-do-we-record-startup-till-as-well-as-record-an.html
- **Lesson:** Clover shows what happens when cash management is a log, not a workflow. Owners end up buying an add-on.

---

### 1.5 Loyverse (very popular with PH micro-merchants; WebNegosyo already integrates with it)

- Shifts are enabled in Back Office → Settings → Features. The POS then gains a **Shift** menu: open with the opening cash amount → Cash management (**Pay In / Pay Out** with an optional comment) → Close shift. https://help.loyverse.com/help/shift-management-loyverse-pos
- **Close summary:** expected cash (from cash sales, refunds and pay in/out) vs actual counted vs difference. **Blind mode = remove the "View shift report" access right**, so the cashier sees only the "Actual cash amount" field. (same source) · Owners see both numbers and the difference. https://loyverse.com/employee-management
- **X / Z:** the current-shift report is the X-report (print without closing). Closing the shift **auto-prints the Z-report** (cash drawer, sales summary, expected, actual, difference). https://help.loyverse.com/help/shift-report-sales-summary-pos
- **Shift is per POS device.** History lists only that device's shifts. Unsynced (offline) open, close or pay events show an **"Unsynced"** badge. https://help.loyverse.com/help/how-work-shift-history-pos
- **Back Office Reports → Shifts:** POS, open/close time, expected, actual and difference per shift, plus exports "Shift summary" and "Pay ins and payouts". (first source)
- Employee management (and with it the blind control) is a **paid add-on** ($25/store/month). https://www.mobiletransaction.org/au/loyverse-pos-review/
- **Complaints:** the opening float doesn't carry over from the previous close, so cashiers forget it; shifts won't open or close; back-office sync is slow (hours). https://www.capterra.com/p/150632/Loyverse-POS/reviews/?page=7 · https://uk.trustpilot.com/review/loyverse.com?page=4

---

### 1.6 StoreHub (direct SEA/PH competitor, BIR-accredited)

- Open Shift / Close Shift on the POS, with the cash count keyed at both ends. **A shift can be closed only on the register, not remotely.** **Closed shifts can't be edited**: a wrong close is fixed in your own books. https://care.storehub.com/en/articles/16572684-shift-report-cash-drawer-over-short-pay-outs-and-cash-sales
- Formula: **Expected = Opening + Cash sales + Cash deposits + Pay In − Cash refunds − Pay Out**. Over/Short = Actual − Expected. Pay Out reasons: *Cash Withdrawal / Buy Inventory / Other (typed reason required, e.g. bank deposit)*. (same source)
- Sales after an unclosed shift's close time roll into the next day. A shift spanning midnight stays in one report. https://care.storehub.com/en/articles/13399077-how-to-understand-your-ph-shift-report
- **PH shift report = BIR X-Reading "for a single shift/cashier"**: TIN, accreditation, MIN, PTU, S/N, Beg/End SI#, opening fund, pay in, withdrawals, cash in drawer, short/over, payments received by method, voids/refunds/withdrawals, **SC/PWD discount summary**, VAT summary, and QR-order-and-pay lines. (same source)
- **Z-Reading = "Close Day"**: you must close every shift first (closing the Z also closes any open shift). It carries Z Count No., Reset Counter, **Present/Previous Accumulated Sales (non-resetting grand total)**, the VATable/VAT-exempt/zero-rated breakdown, a collections summary, and a cash-in-drawer reconciliation. It **can't be edited** once generated. BIR expects one per operational day, even a zero-sales day. https://care.storehub.com/en/articles/13399056-how-to-understand-your-z-reading-report

---

### 1.7 Shopify POS (rebuilt April 2026)

- **Register sessions** come with an on-device summary (cash tracking, payment breakdown, drawer-open log by staff). **Several devices can contribute to one shared cash drawer** through a ledger. **Reason codes are required for any non-order cash activity**, including simply opening the drawer, and admins can customize them. An Admin "Register sessions" tab shows expected balances by location with export. Register extensions can **alert when balances cross float, minimum or maximum thresholds**. https://changelog.shopify.com/posts/new-cash-management-foundations-for-shopify-pos
- **Mid-session cash counts** (Register → Count cash) are logged to the session, so a shortage can be pinned down while the shift is still running. https://changelog.shopify.com/posts/mid-session-cash-counts
- **Retail cash tracking report**: discrepancy summary (expected vs counted), cash payments summary, and a session list, for remote auditing (POS Pro). https://changelog.shopify.com/posts/simplified-cash-reconciliation-for-retail-stores
- **Long-standing complaint:** sessions orphaned on a lost or broken tablet can't be closed from Admin and distort expected cash, so support has to close them. https://community.shopify.com/t/shopify-pos-close-register-cash-tracking/202176

---

### 1.8 TouchBistro

- **End of Day** (Options → Perform End of Day, managers by default) is a screen of areas that must each show a **green check** ("don't ignore red X's"), then print or email the report and tap **Close Day**, "the most important step to ensure sales are separated between each day". https://cdn.touchbistro.com/wp-content/uploads/2016/help/downloadables/FrontEndOperationforManagers892.pdf
- **Pay In / Payout:** preset reasons (Menu → Restaurant → Payout Reasons, e.g. "Vendor payment", "Float addition") plus a comment. **There is a per-staff-type cap** (e.g. bartender $75, manager $200, admin unlimited). It **prints a slip needing server and vendor signatures** and kicks the drawer open. A Payouts Report can be added to EOD and waiter reads. https://cdn.touchbistro.com/help/articles/setting-using-payouts-pay-ins (site TLS blocked direct fetch; content via search index)
- Operator practice in a real TouchBistro restaurant's close checklist: fixed $300 float stays, the rest goes in a "DAY CLOSE ENVELOPE" with the EOD report and a cash breakdown, and "cash must balance within 1%". https://sonyaszabo.notion.site/How-to-Close-The-Cash-607a14acb7be4d9e965feb6e3890f15a

---

### 1.9 Revel (Shift4)

- The API and suite cover tills (open / **hold** / close), bank drops, payouts, cash drops and a **cash office**. https://developer.revelsystems.com/revelsystems/reference
- **Safe Drop** (v2.16) replaced Bank Drop as a *verification* step: the stated drop amount is checked against the physical cash, a manager **assigns the bank deposit to an employee**, and **receipt of the bank slip is recorded with any discrepancy**. Revel recommends drops after rushes and at every shift end. (Revel blog 2016, now redirects; content via search index: https://blog.revelsystems.com/blog/2016/06/24/revel-pos-101-managing-your-cash-flow-like-a-boss)
- **Till alerts:** prompt for a starting till at login, and **alert when a till reaches a set amount** (prompting a drop). Tills are **tied to employees rather than cash boxes**. https://www.fastcasual.com/companies/showcases/revel-systems/products/cash-management-4

---

### 1.10 Odoo POS (best model for tolerance + approval)

- **Opening Control:** the cashier checks or sets the opening cash. **The previous closing balance carries over as the next opening.** https://www.odoo.com/documentation/19.0/applications/sales/point_of_sale/use.html · https://cybrosys.com/blog/how-to-manage-opening-and-closing-controls-in-odoo-17-pos
- **Cash In/Out:** amount plus a **reason**, and only for users with basic or advanced rights. Accepted **Coins/Bills are configurable per POS**. (Odoo docs)
- **Close Register:** shows the order count, total, and **expected amounts grouped by payment method**. The money icon opens the coin/bill counter and fills Cash Count. A **Closing note** is attached. A clone icon copies the expected amount, a known anti-pattern for blind counting. Restaurant mode blocks closing while draft orders exist. Closing **posts accounting entries**, with the difference going to a cash-difference journal. (Odoo docs)
- **Set Maximum Difference / Authorized Difference:** above the limit, the window tells the cashier to **contact a manager for approval**. Below it, "Proceed Anyway" posts the difference. (Odoo docs; Hibou https://hibou.io/docs/point-of-sale-pos-67/pos-advanced-cash-control-1335)
- **Complaint:** the closing screen shows expected cash *before* the count, and hiding it needs custom code. https://www.odoo.com/forum/help-1/pos-can-i-prevent-the-cash-balance-from-being-displayed-before-the-count-is-entered-284254 · Third-party modules add a "Pending Close Session Review" approver state (https://apps.odoo.com/apps/modules/17.0/pos_closure_approval) and closing from the backend (https://apps.odoo.com/apps/modules/19.0/pos_manager_close_session), which shows demand that core Odoo doesn't meet.

---

### 1.11 Oracle Simphony ECM (enterprise ceiling)

- Tracks currency through **tills, server banks, safes, petty cash, change orders and bank deposits** ("enters / moves through / leaves the building"). https://docs.oracle.com/en/industries/food-beverage/simphony/19.3/simcg/c_ecm.htm
- The **View Blind Totals** operator option on the employee class controls who sees expected values and the over/short. https://docs.oracle.com/en/industries/food-beverage/simphony/19.4/simcg/t_ecm_allow_view_blind_totals.htm
- Granular **required-reason switches**: adjust starting amount, adjust count, paid-in, paid-out, transfer, deposit adjustment, and **over/short**. Other options: **restrict a single user per till**; **close a till only after its users' checks are closed**; **save count progress**; **cash-pull threshold notification** after a transaction; **business date selectable up to 7 days back** for a bank deposit; separate **Count Till / Close Till / Deposit** role privileges. Threshold sets: Cash Count, Cash Pull, PAR level. https://docs.oracle.com/en/industries/food-beverage/simphony/simcg/t_ecm_set_cash_mgmt_parameters.htm
- Oracle Xstore till accountability: reconciliation needs ENDCOUNT status, the till removed from the register, **and the till returned to the manager**, who recounts it against the cashier's count. That is the two-person model. https://docs.oracle.com/en/industries/retail/retail-xstore-point-of-service/21.0/rpxmg/till-accountability-mode-only-functions.htm

---

## 2. Feature matrix

Legend: ✅ native · ◐ partial/limited · ❌ none/not documented · $ paid add-on

| Capability | Square | Toast | Lightspeed K/L | Clover | Loyverse | StoreHub PH | Shopify | TouchBistro | Revel | Odoo | Simphony |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Business-day cutoff after midnight | ◐ reporting hours (separate from transfer close-of-day) | ✅ closeoutHour 0–12, default 4 AM (support-set) | ✅ sales period open/close by manager | ◐ closeout time, 1×/7 days | ❌ (shift = period) | ◐ shift spans midnight; Close Day | ❌ | ✅ manual Close Day | ◐ | ◐ session | ✅ business date |
| Auto-close at cutoff | ❌ (30-day stale) | ✅ drawers, checks, clock-outs | ❌ | ✅ card batch only | ❌ | ❌ | ❌ | ❌ | ? | ❌ | ? |
| Opening float, default/carry-over | ✅ default | ✅ auto/manual reset | ✅ default + counting modes | ❌ | ◐ manual (complaint) | ✅ | ✅ | ◐ | ✅ prompt at login | ✅ carry-over | ✅ |
| Assigned (per-employee) drawer | ❌ per device | ✅ lockdown | ✅ user wallet | ❌ | ❌ per device | ❌ | ✅ shared ledger | ◐ | ✅ tills to employees | ◐ | ✅ single user per till |
| Multiple drawers/device | ❌ | ✅ primary/secondary | ✅ | ❌ | ❌ | ❌ | ✅ shared | ? | ✅ | ❌ | ✅ |
| Pay in / out | ✅ free text | ✅ typed reasons | ✅ + reason | ✅ log | ✅ + comment | ✅ preset + typed | ✅ reason codes | ✅ preset + cap + signed slip | ✅ | ✅ + reason | ✅ + required reason |
| Cash drop / safe | ❌ | ✅ Cash drop type | ◐ | ◐ | ❌ | ◐ (as Pay Out) | ◐ | ❌ | ✅ verified Safe Drop | ❌ | ✅ safes |
| Mid-shift count | ❌ | ◐ pause | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ? | ❌ | ✅ |
| Denomination count UI | ❌ (requested for years) | ✅ + quick presets | ✅ quantities | ❌ | ❌ | ❌ | ? | ❌ | ? | ✅ coins/bills | ✅ count sheets |
| Blind close | ◐ permission | ✅ Blind vs Full | ❌ documented | ❌ | ✅$ via access right | ? | ? | ❌ | ? | ❌ (complaint) | ✅ |
| Variance tolerance + manager approval | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ◐ alerts via ext. | ◐ 1% (policy) | ◐ till alerts | ✅ authorized difference | ◐ thresholds + reasons |
| Required variance reason | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ? | ◐ closing note | ✅ |
| Reopen/correct closed shift | ❌ | ✅ adjust entries | ? | — | ❌ | ❌ (immutable) | ? | ? | ? | ◐ journal | ✅ adjust count (reason) |
| X report (non-resetting) | ❌ | ✅ Z printable anytime | ✅ | ◐ | ✅ | ✅ BIR X | ✅ summary | ✅ waiter read | ✅ | ◐ | ✅ |
| Z report (end of day, resets) | ✅ close of day (SfR) | ✅ | ✅ | ◐ | ✅ auto-print | ✅ BIR Z + grand total | ◐ | ✅ | ✅ | ✅ session | ✅ |
| Deposit / bank slip | ❌ | ✅ deposit variance | ◐ deposit calc | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ slip receipt | ✅ journal | ✅ deposit refs |
| Non-cash reconciliation | ◐ | ✅ card tips | ✅ tips declared | ✅ batch | ◐ | ✅ by method | ✅ breakdown | ✅ | ✅ | ✅ by method | ✅ by tender |
| Variance history by employee | ◐ | ◐ drawer history + closer | ◐ | ✅ cash log filter | ◐ per shift | ◐ | ✅ discrepancy summary | ◐ | ✅ | ◐ | ✅ |
| Works on phones | ❌ | ❌ (Flex only) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ iPad | ✅ | ✅ | ❌ |

---

## 3. Notable UX patterns worth copying

1. **Closing as a checklist with green ticks** (TouchBistro EOD, Toast Close Out Day, Square Close of Day preview). Each blocker (open orders, open drawers, clocked-in staff) is a row with a one-tap fix. Overrides need the owner passcode (Square).
2. **"Count this drawer later" → Paused** (Toast). The cashier can hand the tablet to the next shift immediately. A fresh drawer opens, and the old one is tagged *TO BE COUNTED* but can still receive add/remove-cash corrections.
3. **Denomination counting by quantity, not value** (Lightspeed, Odoo, Toast). Big tappable rows (₱1000 × __), a running total, and quick presets that say whether they include the float.
4. **Blind by permission, not by setting** (Toast 3.17/3.18, Loyverse access right, Simphony View Blind Totals). The same screen simply hides "Expected" and "Difference" for a cashier role, and the owner sees all three.
5. **Typed reasons on every non-sale cash movement** (Toast: Cash out / Payout / Tip out / Cash drop; StoreHub: Withdrawal / Buy inventory / Other + text; Shopify: required reason codes even for "open drawer"). Caps per role with a **signed paper slip** (TouchBistro).
6. **Close prints its own report automatically** (Loyverse Z, Lightspeed drawer report). The cashier doesn't have to remember to print.
7. **Deposit = actual − float**, computed for you, with the float staying in the drawer (Toast warning; a top Square feature request).
8. **Threshold-triggered prompts.** Revel/Simphony fire a "drawer is over ₱X, do a safe drop" prompt after a transaction. Shopify extensions alert on float, min and max.
9. **One accountable person per drawer** (Toast lockdown, which blocks clock-out until the drawer is closed; Simphony "single user per till"; Revel tills tied to employees).
10. **Tolerance band + escalate** (Odoo): within ±X the cashier proceeds, beyond it a manager must approve.
11. **Shift impressions / closing note** (Lightspeed weather + rating, Odoo closing note) give the owner context next to the numbers.

---

## 4. The "standard" feature set every good POS has

1. Open a shift/drawer with a starting float (default amount, editable).
2. Pay In / Pay Out with a reason.
3. Expected cash = float + cash sales − cash refunds + pay in − pay out (StoreHub's published formula is the clearest).
4. Close with a counted amount → over/short shown and stored.
5. Shift/drawer report (X) and end-of-day report (Z), printable on a receipt printer.
6. Back-office list of shifts with expected/actual/difference, filterable by date, device and employee, and exportable.
7. Permissions controlling who may open the drawer outside a sale, do pay outs, and close.
8. An end-of-day gate: you can't close the day with open orders or drawers.

## 5. Differentiators of the best

- **Configurable business-day cutoff (e.g. 4 AM) plus auto-close at the cutoff** (Toast). Late-night sales stay in the trading day, and abandoned drawers never bleed into tomorrow.
- **Blind close by role** (Toast, Simphony, Loyverse$).
- **Denomination counter** (Toast, Lightspeed, Odoo).
- **Variance tolerance with manager approval and a required reason** (Odoo + Simphony together; nobody else does both).
- **Cash drops to a safe and verified deposits with bank-slip receipt** (Revel, Toast, Simphony), i.e. a true chain of custody from drawer to safe to bank.
- **Pause / count later, then reopen and adjust with an audit trail** (Toast).
- **Mid-shift count** (Shopify 2026) and **till-full alerts** (Revel, Simphony).
- **Shared drawer across devices via a ledger** (Shopify 2026), which matters for multi-tablet counters.
- **Server banking / cash owed to the house** (Toast, Square SfR shift report): for staff who collect cash without a drawer, such as delivery riders and table servers.
- **Regulatory X/Z with a non-resetting grand total** (StoreHub PH, BIR).

## 6. Common complaints about cash-out flows

| Complaint | Evidence |
|---|---|
| Expected cash is "wrong" because the float wasn't counted or a device had no drawer linked | https://community.squareup.com/t5/Archived-Discussions-Read-Only/Expected-Cash-In-Drawer-Amount/m-p/92410 · https://support.toasttab.com/en/article/Cash-Drawer-Reports-Overview |
| No denomination counter, so staff count on a calculator or spreadsheet; asked for since ~2016 | https://community.squareup.com/t5/Feature-Requests/Register-Count-by-Denomination-Cash-Drawer/idi-p/680746 · https://community.squareup.com/t5/Feature-Requests/Cash-counting-function-for-closing-cash-drawer/idi-p/799830 |
| Expected amount shown before counting (no blind count) | https://www.odoo.com/forum/help-1/pos-can-i-prevent-the-cash-balance-from-being-displayed-before-the-count-is-entered-284254 |
| Typo at open breaks the whole report and can't be fixed ("started with $1M instead of $100") | https://community.squareup.com/t5/Questions-How-To/An-employee-started-a-cash-drawer-with-1M-instead-of-100-Closed/td-p/679064 · StoreHub: closed shifts can't be edited |
| Forgot to close yesterday, so today's drawer is forced open or only a manager on the web can close it | https://sellercommunity.com/t5/Square-Register/RESOLVED-10-30-23-Last-two-updates-have-forced-my-cash-drawer-to/m-p/662994 |
| Orphaned sessions on a lost or broken device that admins can't close | https://community.shopify.com/t/shopify-pos-close-register-cash-tracking/202176 |
| Opening float doesn't carry over from the last close, so cashiers forget to enter it | https://www.capterra.com/p/150632/Loyverse-POS/reviews/?page=7 |
| Late-night sales land on the wrong day | https://community.squareup.com/t5/Questions-How-To/How-do-I-change-the-daily-sales-reports-if-my-close-of-day-is/m-p/30387 |
| Undoing a shift review or tip-out leaves the drawer "short" with no trace of the reversal | https://community.toasttab.com/t5/restaurant-operations/reopening-shift-review-throws-off-drawer/m-p/14750 |
| Paid-outs are only visible per drawer, with no consolidated report | https://community.squareup.com/t5/Archived-Discussions-Read-Only/How-do-you-track-or-account-for-paid-outs/m-p/211821 |
| A per-device drawer model doesn't fit restaurants where many staff share one till | https://community.squareup.com/t5/Orders-Menu-Items-Catalog/Cash-Drawer-Imbalance/td-p/388334 |
| Offline: shift events unsynced, back office lags hours | https://help.loyverse.com/help/how-work-shift-history-pos · Capterra above |
| Cash management is a paid add-on or a third-party app (Loyverse employee mgmt, Clover Cash Track) | sources above |

---

## 7. Implications for WebNegosyo (PH, tablets + phones)

These are recommendations drawn from the findings, not vendor facts.

1. **Business day:** let the store set a cutoff (default 4 AM, Asia/Manila) and attribute each order to `business_date` at write time. Auto-close, or better *auto-pause as "To be counted"*, any shift still open at the cutoff, so the next cashier is never blocked. This avoids the Square forced-reset complaint and the Shopify orphan problem, because an owner can close a shift remotely from the web or app.
2. **Accountable unit = cashier shift on a device**, with an optional "shared drawer" mode for multi-tablet counters (Shopify ledger model). PH stores routinely hand one tablet between cashiers, so "Count later / Pause" is essential.
3. **Remittance is the PH-specific heart of it.** The cashier counts (blind by default for staff), then **remits to a named receiver** (owner/manager). The receiver recounts or confirms, giving two-person sign-off (Xstore model), and the remittance carries the amount, the float left in the drawer (Toast "exclude starting balance"), and a photo of the cash and slip. Then an optional deposit to the bank, GCash or Maya with a reference number (Revel slip receipt).
4. **Denomination counter in PHP** (₱1000/500/200/100/50/20 bills and ₱20/10/5/1/0.25 coins), by quantity, with a live total and a big "Short ₱X / Over ₱X" result shown only after submit.
5. **Tolerance + reason + approval** (Odoo + Simphony): within ±₱N, proceed; beyond it, a required reason and the owner's approval (PIN on the device or remote approval in the app). Store a variance history per cashier with streaks, in the spirit of "consistent small shorts or overs are the pattern to watch".
6. **Typed cash movements**: Pay in (change fund), Pay out (supplier, rider, ingredients — and link it to the planned Expense Tracker, `docs/plans/2026-10-21-expense-tracker.md`), Cash drop (to safe/owner), Tip out. Per-role caps (TouchBistro).
7. **Non-cash reconciliation**: list expected by method (GCash, Maya, card, bank transfer, Foodpanda/Grab) with an optional "confirmed" tick or reference count. E-wallet totals should be checked against the merchant's e-wallet app, the way Odoo shows expected per payment method.
8. **X / Z** that line up with the existing BIR sales book work: the shift report is the X-reading (cashier accountability) and Close Day is the Z-reading (non-resetting grand total, SC/PWD summary, VAT breakdown, Beg/End invoice numbers), and neither can be edited once printed (StoreHub PH). Auto-print on close (Loyverse).
9. **Avoid the known traps:** carry the last closing float forward as the default opening float; allow a correction with a reason and audit trail instead of "immutable and fix it in your books"; show offline/unsynced state; make the whole flow work on phones (Square and Toast don't).
