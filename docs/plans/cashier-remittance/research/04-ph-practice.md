# 04 — Philippine market practice: cashier shifts, remittance, X/Z readings

Researcher brief for the **Cashier shift & remittance** feature (WebNegosyo / SmartMenu).
Researched 2026-10-26. Confidence tags: **[LAW]** = the primary legal text was read; **[VENDOR]** = a POS vendor's documentation; **[SECONDARY]** = law-firm or commentary site; **[INFERENCE]** = my own synthesis, not sourced.

---

## TL;DR for the product team

1. **Every serious PH POS splits "shift close" (X / cashier accountability) from "day close" (Z).** A store can have many shifts per business day and exactly one Z per register per business day. Closing the day forces any open shift to close first (StoreHub, Mosaic).
2. **Expected cash** is computed the same way by every vendor checked: opening float + cash sales + pay-ins (+ cash deposits/advance orders) − cash refunds − pay-outs/withdrawals/safe drops. **Over/short = counted − expected.**
3. **Blind close is a standard owner control.** Loyverse lets the owner hide "expected cash" from cashiers, and Mosaic makes the cashier declare counts per denomination before a supervisor authorises Day End. Owners see both figures and the difference.
4. **A business day that crosses midnight is normal in the PH market.** StoreHub's business day runs from a configurable "closing time" (for example 03:00 to 02:59), and Mosaic's "POS date" is advanced only by Day End and can lag the calendar date. **No legal text was found that requires a calendar-midnight cut.** RR 11-2004 only says the machine must produce a "reading of daily sales". Recommendation: a configurable cutoff, with the business date plus the real start/end timestamps printed on the report.
5. **Deducting a cashier's shortage from salary is presumptively illegal** (Labor Code Art. 113). It is allowed only under narrow conditions: a recognised practice, the employee heard, responsibility clearly shown, the actual loss only, and at most 20% of weekly wages. The product should **record** shortages, explanations and acknowledgements. It must **never** offer a "deduct from salary" action.
6. **Denominations to count (as of 2026):** bills ₱1000, ₱500, ₱200, ₱100, ₱50, ₱20 (₱20 and ₱200 notes are legal tender but no longer printed); coins ₱20, ₱10, ₱5, ₱1, 25¢ (1¢ and 5¢ exist but are almost never counted). Polymer ₱1000/₱500/₱100/₱50 notes circulate alongside paper notes and are counted the same way.
7. **Non-cash takings (GCash, Maya, cards, bank transfer, Grab, foodpanda) are reconciled, not remitted.** Show them on the shift report so the owner can match reference numbers. Keep them out of the cash expected total. GCash itself warns that screenshots are not proof of payment.

---

## 1. Local POS competitors: how they handle shifts and end of day

### StoreHub (PH, BIR-accredited) — the most thoroughly documented
- **Open/close shift:** the cashier must key in the drawer cash at both open and close, or the Cash Drawer Summary is wrong. Path: Close Shift → Close Register → enter Closing Amount. [VENDOR] ([open/close shift](https://care.storehub.com/en/articles/6363457-how-to-open-close-shift-on-pos), [shift report guide](https://care.storehub.com/en/articles/5850192-shift-report-guide))
- **Expected drawer** = Opening Amount + Cash Sales + Cash Deposits + Pay In + Cash Rounded − Cash Refunds − Pay Out. **Over/Short** = Actual − Expected (0 = balanced, positive = over, negative = short). Cancelled transactions are excluded. [VENDOR] ([over/short article](https://care.storehub.com/en/articles/16572684-shift-report-cash-drawer-over-short-pay-outs-and-cash-sales))
- **Their own list of causes of shortages:** unrecorded pay-outs (bank deposits are the common case), unrecorded pay-ins, a wrong opening or closing count, and real cash loss. Advice: record every cash removal as a Pay Out ("Cash Withdrawal", "Buy Inventory", "Other" + reason) and always key in the exact count. **Closed shifts cannot be edited**, so corrections go in your own books. A refund made with no shift open lands in no shift report. [VENDOR] (same source)
- **PH Shift Report sections:** store/TIN/MIN/PTU/S/N, Beg./End SI#, start/end time, Opening Fund, Payments Received (cash, credit, debit), Void/Refund/Withdrawals, Deposits (advance orders), Discount & Tax summary (SC/PWD, 12% VAT), Transaction Summary (Opening Fund, Pay In, Withdrawals, Cash in Drawer, Short/Over), and a per-transaction list with Employee. GCash and Maya are **not** broken out in that article. [VENDOR] ([PH shift report](https://care.storehub.com/en/articles/13399077-how-to-understand-your-ph-shift-report))
- **Shift ≠ day:** "Closing the shift is not the same as closing the day." The shift report is the X-reading for one shift or cashier. A separate **Close Day / Close Z-Reading** must be run daily. If a shift is still open, the system makes you close it first. A Z-reading needs internet, is finalised on close, and can't be edited. [VENDOR] ([BIR quick start](https://care.storehub.com/en/articles/13223804-ph-storehub-bir-compliance-updates-quick-start-guide), [BIR reports](https://care.storehub.com/en/articles/13398964-how-to-view-and-download-bir-reports-pos-backoffice))
- **Late-night stores:** a BackOffice "closing time" defines the business day. Example: a 03:00 closing time means 03:00 today to 02:59 tomorrow is one business day, and "All sales reports and X/Z readings follow a 24-hour cycle based on this time." The same article *also* says the system generates Z-readings at midnight regardless, and warns that a wrong setting puts late sales on the wrong day. **These two statements conflict.** Either way, it shows that a cutoff past midnight is an expected setting. [VENDOR] ([F&B operating hours](https://care.storehub.com/en/articles/5726877-how-to-set-up-f-b-operating-hours))

### Mosaic POS (PH F&B)
- An X-Read consolidates sales for **a shift**, and a Z-Read covers the **whole business date**. [VENDOR] (Mosaic e-journal guide, mosaic-solutions.helpscoutdocs.com/article/82, now 404; quoted in search snippets)
- **Day End flow:** Settings → Day End → Show Spot Audit → **supervisor authorises** → Open Cash Drawer → **declare quantity per bill and coin (Cash Breakdown)** → declare non-cash Payment Totals → Save → supervisor authorises again → Day End → "Yes & Print Z-Read" (prints the Z-Reading + P-MIX, syncs, logs everyone out). Reprinting a Z-Read needs an approver passcode. [VENDOR] ([day end](https://support.mosaic-solutions.com/knowledge/how-to-day-end-by-using-show-spot-audit), [reprint Z](https://support.mosaic-solutions.com/knowledge/reprinting-of-z-read-report))
- **The POS date is separate from the calendar date.** It advances only when Day End runs. If they drift apart (holidays, closures), you run Day End repeatedly or ask support to "Force Date Change". In practice the business date is decoupled from midnight. [VENDOR] ([POS date mismatch](https://support.mosaic-solutions.com/knowledge/pos-date-mismatch-or-not-aligned), [sync dates](https://support.mosaic-solutions.com/knowledge/how-to-sync-pos-date-and-calendar-date))

### Loyverse (very popular with PH micro-merchants; not BIR-accredited per a 2023 competitor claim)
- Shifts are an owner toggle (Settings → Features). Open shift = enter the starting drawer cash. **Pay In** (for example someone brings change) and **Pay Out** (small expenses) sit under Cash management and are logged. Close shift shows **Expected / Actual / Difference**. [VENDOR] ([Loyverse shifts](https://help.loyverse.com/help/shift-management-loyverse-pos))
- **Blind close:** turning off the "View shift report" access right means cashiers see only the actual-cash field. The owner sees both figures and the difference. Back Office lists shifts per POS device with expected, actual and difference, plus export. [VENDOR] (same; [employee management](https://loyverse.com/employee-management))
- Works offline. Refunds aren't available offline, and you can't sign out with unsynced receipts. [VENDOR] ([offline](https://help.loyverse.com/help/offline-work-of-pos))
- A user wished the **previous day's closing cash would carry over automatically** as the next opening float. [SECONDARY] ([SoftwareFinder review](https://softwarefinder.com/retail/loyverse/reviews?page=2))
- "Not on BIR's accredited list as of Oct 26, 2023" is StoreHub's claim, and StoreHub is a competitor. [VENDOR] ([StoreHub vs Loyverse](https://www.storehub.com/ph/blog/storehub-vs-loyverse))

### Qashier (PH/SG)
- Has BIR features: X-Reading, Z-Reading, E-Journal and E1–E6 backend reports, plus a Cash Management report in QashierHQ. The help pages returned 403, so the details are unverified. The search snippet says the daily reset "resets running totals to zero (except the grand total)". [VENDOR] ([BIR compliance](https://support.qashier.com/en/articles/14815420-philippine-bir-compliance-special-discounts-receipts-audit-reports), [cash management](https://support.qashier.com/en/articles/7978130-cash-management-report-in-qashierhq))

### UTAK (PH, ~8,000 MSMEs)
- There is no public help documentation on shifts or cash counts, so its mechanics couldn't be verified. It is marketed on sales/inventory/**staff attendance with a selfie**/cash tracking. Competitors say it has basic reporting, no food-delivery or accounting integrations, and (StoreHub, Nov 2023) no BIR accreditation, with a partner offering registration for about ₱4,000. All of this comes from competitors. [VENDOR/SECONDARY] ([StoreHub top-3 restaurant POS](https://www.storehub.com/ph/blog/top-3-pos-systems-for-your-restaurant), [klikit](https://klikit.io/zh-CN/learn/utak-alternative-philippines), [HashMicro vs Utak](https://www.hashmicro.com/ph/blog/hashmicro-vs-utak/))

### Merchant sentiment (praise and complaints)
Facebook groups are not reachable by search. These are the signals found:
- **Praise patterns** (vendor and review sites): owners value checking sales remotely on a phone, offline operation (patchy internet outside Metro Manila), and cheap tablet hardware. [SECONDARY]
- **Complaints and pain points:**
  - Stuck or mismatched business dates (Mosaic needs repeated Day Ends) — [VENDOR]
  - A Z-reading that can't close without internet (StoreHub) — [VENDOR]
  - Closed shifts can't be corrected — [VENDOR]
  - Unrecorded pay-outs and bank deposits making shifts "short" — [VENDOR]
  - Opening cash not carried over — [SECONDARY]
  - Delivery-platform payouts far below the order value. One foodpanda case: ₱450 of orders produced a ₱38.50 payout after commission, fees and taxes. ([Unbox](https://unbox.ph/news/shop-owner-says-foodpanda-took-almost-all-her-sales/))
- **Cashier-side pain (important for tone):** a 2023 Senate Labor Committee hearing (Sen. Tulfo) on Landmark cashiers. They testified that their boxes were **not counted in front of them**, that security collected cash mid-day, that shortages were reported days later and **deducted from pay even when they refused to sign**, and that the records were called "confidential". ([Inquirer](https://newsinfo.inquirer.net/?p=1723096), [Inquirer — Tulfo](https://newsinfo.inquirer.net/1723197/tulfo-grills-mall-security-chief-over-interrogation-of-cashier)) **Product implication:** count with the cashier present, show the result to the cashier straight away, and let the cashier add an explanation.

---

## 2. BIR rules that touch end of day

### What the law actually says (primary text read)
**RR 11-2004** (accreditation, registration and use of CRM/POS), via [Lawyerly](https://dev.lawyerly.ph/laws/39308) [LAW]:
- §5.1.1: "The machine must have a **non-resettable accumulating grand total**" of at least 10 digits. A CRM has a reset counter that advances by one. POS machines generate a unique sequential number per transaction. §10.3.1: every reset must be recorded and reported to the BIR.
- §5.1.3: the machine and/or central server must "generate a report showing the **reading of daily sales**."
- §5.3 (server-based POS): "all sales per POS must be automatically and completely recorded in the central server", kept for the assessment period.
- §10.2.2: "No POS Machine shall be operated without the corresponding **electronic journal**."
- **The text does not use the words "X-reading", "Z-reading", "end of day" or "midnight".** "X/Z" is vendor and BIR-practice vocabulary. It is not statutory wording in RR 11-2004.

**RMO 24-2023** (revised accreditation of sales machines/software; eAccReg; TWG system demo). The full text was not retrievable. Secondary sources say it lists activity logs, non-volatile memory, e-journal, backend reports, reprint, data retention and sales-data transmission as required features. They also say the application includes **Annex D-1 (X-Reading sample)** and **Annex D-2 (Z-Reading sample)**, plus backend reports (Annex E: BIR Sales Summary, SC/PWD/NAAC/Solo Parent sales books). Certificates valid until 31 Jul 2025 onward had to re-apply under RMO 24-2023 (RMC 72-2025). [SECONDARY] ([Respicio — audit trail](https://www.respicio.ph/commentaries/audit-trail-requirements-for-pos-accreditation-in-the-philippines), [context.ph](https://context.ph/2023/07/22/bir-modifies-rules-process-in-accreditation-of-sales-machines/), [PwC Tax Alert 22](https://www.pwc.com/ph/en/tax/tax-publications/tax-alerts/2025/tax-alert-22.html)). **The official annexes should be read before copying any field list.**

**RR 7-2024 (EOPT invoicing, effective 27 Apr 2024):** the Sales Invoice replaces the Official Receipt as the primary proof of sale. POS/CRM may rename "Official Receipt" to "Invoice" without notifying the RDO (Section 8; a minor enhancement), and the serial series continues. So a modern Z-reading shows **Beg./End SI#**, not OR#. [SECONDARY] ([Grant Thornton](https://www.grantthornton.com.ph/insights/articles-and-updates1/line-of-sight/point-of-sale-software-challenges-in-birs-digitalization-era/), [Forvis Mazars](https://forvismazars.com/ph/en/insights/tax-alerts/ease-of-paying-taxes-act/vat-invoicing-requirements-eopt-act), [PwC](https://www.pwc.com/ph/en/tax/tax-publications/taxwise-or-otherwise/2024/eopt-invoicing-clarified.html)). Sources disagree on whether the cutoff for "OR" wording was 27 Apr or 30 Jun 2024.

**eSales:** taxpayers using CRM/POS file a **monthly eSales report per machine**, including machines with zero sales (RR 5-2005, RMO 12-2012). Amending reported sales needs a written justification to the RDO (RMC 56-2015). Mandatory e-invoicing (RR 11-2025, extended by RR 26-2025 to 31 Dec 2026) **defers POS users** until the BIR system and separate regulations exist. [SECONDARY] ([Roque Law](https://roquelaw.com.ph/additional-requirement-for-e-sales-reporting-from-crmpos-machines/), [Grant Thornton](https://www.grantthornton.com.ph/insights/articles-and-updates1/tax-notes/create-more-mandatory-use-of-electronic-invoicing-and-electronic-sales-reporting-with-allowable-deduction/), [NDV Law](https://ndvlaw.com/mandatory-e-invoicing-in-the-philippines-why-you-must-transition-to-the-bir-electronic-sales-reporting-system-by-2026/)). The field layout of eSales was not found.

### X vs Z: requirement vs practice
| | X-reading | Z-reading |
|---|---|---|
| Scope | Since shift start, per cashier or shift | Whole business day, per register |
| Resets totals? | No (run as often as you like) | Yes for daily totals. The grand total keeps accumulating |
| Frequency | Any time, usually at each shift close / cashier handover | Once per register per business day, **even on zero-sales days** (StoreHub) |
| Legal status | **Per-cashier X at handover is internal-control practice.** No BIR rule requiring it was found | The "daily sales reading" is required (RR 11-2004 §5.1.3). The Z sample is part of accreditation (RMO 24-2023) |

### What an owner expects on a "Z-reading-like" end-of-day report
Synthesised from StoreHub's PH Z-reading ([source](https://care.storehub.com/en/articles/13399056-how-to-understand-your-z-reading-report)), Respicio's list ([source](https://www.respicio.ph/commentaries/audit-trail-requirements-for-pos-accreditation-in-the-philippines)) and StoreHub's note that the Gross now includes voids and the footer shows beginning and ending sequence numbers for sales, voids and refunds. [VENDOR + SECONDARY]
- **Header:** store name, TIN (VAT/Non-VAT), branch, register/device, business date, **start and end timestamps**, Z counter (sequential number), reset counter.
- **Sequence:** beginning and ending SI/invoice #, plus beginning/ending void # and refund #.
- **Accumulated:** previous accumulated sales (grand total), present accumulated sales, and today's sales.
- **Sales breakdown:** gross amount, less discounts (SC, PWD, Solo Parent, NAAC/MOV, regular/promo), less returns/refunds, less voids, less VAT adjustment (VAT removed for SC/PWD), net amount. VATable sales, VAT amount (12%), VAT-exempt sales, zero-rated sales. Service charge shown separately.
- **Discount summary** by type, with counts.
- **Collections by payment method:** cash, card, GCash, Maya, bank transfer, delivery platforms, charge/AR.
- **Cash reconciliation:** opening fund, pay-ins, withdrawals/pay-outs, cash in drawer, short/over.
- **Counts:** transactions, voided transactions, refunded transactions, guests/covers (optional).

Because we are **not** accredited, the report must not claim to be a BIR Z-reading. Suggested names: "End-of-day summary" or "Daily close (Z-style)", with a note that it is not a BIR-accredited reading. [INFERENCE]

### May the business day cross midnight?
- **No primary text was found that fixes the day at calendar midnight.** RR 11-2004 speaks only of "daily sales". [LAW]
- **Accredited vendors do decouple the two.** StoreHub's configurable closing time, Mosaic's POS date advanced by Day End, Lightspeed's and NCR's "business date" concepts. [VENDOR] ([Lightspeed custom business day](https://shopkeep-support.lightspeedhq.com/support/backoffice/custom-business-day), [NCR business dates](https://docs.ncrvoyix.com/restaurant/silver-essentials/using/understanding_business_dates))
- **Uncertainty:** StoreHub's own text says Z-readings are generated at midnight regardless of closing time, and no RDO ruling was found. **Recommendation:** a store-level "day ends at" setting (default 04:00 for bars, midnight for others). Every report shows the business date plus the real first and last timestamps, so an accountant can re-cut by calendar date if an RDO asks. Owners should confirm with their accountant. [INFERENCE]

---

## 3. Operational practice in PH restaurants

### Shift flow seen in PH cashier job descriptions [SECONDARY]
- "Check if **change fund** is complete and intact at the start of shift". "Counts the sales … on the last hour of the shift". "Deposit the cash sales in the **vault** or personally **turn-over** to the Supervisor". "Prepare **cash count sheet to be acknowledged by incoming cashier**". Disbursements only for listed items (fresh ingredients, bakery supplies, utility bills), otherwise ask the supervisor. ([PhilJobNet cashier posting](https://philjobnet.gov.ph/job-vacancies/job/cashier-966457))
- "Perform end of shift **X, Y, Z readings**… Declaration of any cash over and accountability for any cash short." ([Bossjob posting](https://bossjob.ph/job/cashier-233165))
- "Collection Report / **Remittance Report**", "monitor short payments in the log book". ([Bossjob Pasig](https://bossjob.com/job/cashier-pasig-310641))
- Change fund variances are reported to the supervisor (retail).
- PH cash count sheets (CAAP, a Bacolod firm) list denomination × pieces = amount, an overage/shortage section, and **signatures of both the counter and the custodian**. ([Scribd cash count sheet](https://www.scribd.com/document/888971258/Cash-count-sheet), [Scribd cash count form](https://www.scribd.com/doc/89155525/Cash-Count-Form))

**The typical PH flow** (synthesis): open shift with a fixed change fund ("pang-sukli") → sell → pay-outs for market runs or ice (with a resibo) → optional mid-shift **safe drop / pick-up** of big bills → end of shift: count by denomination (often in front of the manager or the next cashier) → leave the change fund in the drawer → put the remainder in an envelope or remittance slip → hand to the owner/manager or the vault → the owner deposits to the bank later. The owner checks remotely on a phone (Loyverse/StoreHub Back Office). [INFERENCE from the sources above]

### Denominations (confirmed)
- **Coins (NGC):** 1¢, 5¢, 25¢, ₱1, ₱5 (nonagonal since Dec 2019), ₱10, **₱20 (bimetallic, Dec 2019)**. A commemorative ASEAN 2026 ₱10 coin was issued in Jan 2026 (legal tender, same value). ([Wikipedia NGC](https://en.wikipedia.org/wiki/New_Generation_Currency_Series), [BIS — Diokno speech](https://www.bis.org/review/r191220g.htm), [context.ph](https://context.ph/2025/11/28/bsp-launches-new-coins-celebrating-ph-festivals-and-asean-2026/))
- **Bills:** ₱1000, ₱500, ₱200, ₱100, ₱50, ₱20.
  - The ₱20 note is still legal tender alongside the coin and is being removed by attrition. ([ABS-CBN 2021](https://abs-cbn.com/business/09/28/21/bsp-p20-bill-remains-legal-tender))
  - The ₱200 note stopped production in 2021 but is still legal tender.
  - **Polymer ₱1000 (2022) and ₱500/₱100/₱50 (from 23 Dec 2024)** circulate alongside paper notes, and the BSP has no plan to phase out paper. ([Philstar](https://www.philstar.com/headlines/2024/12/23/2409261/p50-p100-p500-polymer-banknotes-released-today), [GMA](https://www.gmanetwork.com/news/money/economy/930435/bsp-unveils-new-polymer-banknotes/story/))
- **Suggested count rows:** 1000, 500, 200, 100, 50, 20 (bill), 20 (coin), 10, 5, 1, 0.25, plus an optional "other coins / loose" amount field. Merge the ₱20 bill and coin into one ₱20 row with a hint, or keep them separate. Count paper and polymer the same.
- Counterfeit polymer notes jumped to 1,358 pieces in 2025 (from 3), so a "suspected fake" note on the count is reasonable. ([Manila Bulletin](https://mb.com.ph/2026/07/17/bsp-logs-sudden-surge-in-counterfeit-polymer-bills))

### Non-cash in the remittance
- **GCash/Maya:** GCash warns about AI-generated fake receipts and says to check the **Transactions tab** (reference no., sender, amount, time) and not to rely on screenshots. ([GCash/Mynt](https://mynt.com.ph/newsroom/gcash-warns-public-on-emerging-ai-generated-fake-receipts-scams-urges-users-to-always-check-transactions-tab)) Settlement follows the provider's schedule, so the wallet balance won't equal the shift total the same day. ([Maya developers](https://developers.maya.ph/docs/gcash), [HitPay T+1](https://hitpayapp.com/ph/blog/accepting-gcash-qr-ph-on-your-restaurant-pos-a-2025-philippines-playbook)) → On the shift report, list e-wallet sales **with their reference numbers** for the owner to tick off. Keep them out of cash expected. (This platform already stores payment proof and reference numbers.)
- **Grab / foodpanda:** paid through platform payouts with commission and fee deductions, so they are not cash to remit. COD handling by riders couldn't be confirmed from official docs. → Show them as a separate "Delivery apps" line and exclude them from cash. [INFERENCE + [klikit](https://klikit.io/en/learn/grabfood-pos-integration-philippines)]
- **Cards and bank transfer:** same treatment, reconciled against the bank. Mosaic makes the cashier *declare* non-cash totals at Day End as well as cash.

### Shortages ("kulang") and overages ("sobra"): legal position
- **Labor Code Art. 113 [LAW]:** "No employer … shall make any deduction from the wages of his employees, except" (a) insurance with consent, (b) union dues, (c) "where the employer is authorized by law or regulations issued by the Secretary of Labor." **Art. 114:** no deposits for loss or damage, except in trades where the practice is recognised or as DOLE determines. **Art. 115:** no deduction for loss "unless the employee has been heard thereon, and his responsibility has been clearly shown." ([LawPhil PD 442](https://lawphil.net/statutes/presdecs/pd1974/pd_442_1974.html))
- **IRR Book III, Rule VIII, Sec. 14** (section number varies by edition) [SECONDARY]: all of these at once — employee clearly responsible, a fair chance to explain, amount fair and ≤ actual loss, and **≤ 20% of the employee's wages in a week**. ([Respicio](https://www.respicio.ph/commentaries/can-an-employer-deduct-salary-for-shortages-in-the-philippines), [Alburo Law](https://www.alburolaw.com/deductions-on-employees-salary-for-deposits-in-case-of-loss-or-damage-to-employers-property/))
- **Case law** [SECONDARY]:
  - *Niña Jewelry v. Montecillo* (G.R. 188169, 2011): a deposit/deduction policy failed because it wasn't a proven recognised practice.
  - *Bluer Than Blue v. Esteban* (G.R. 192582, 2014): an inventory-variance deduction was illegal because responsibility wasn't proven and there was no chance to explain.
  - *Marby Food Ventures v. Dela Cruz* (G.R. 244629, 2020): liquidation shortages had to be refunded.
- A handbook clause or blanket signature does **not** make a deduction legal. Holding back final pay until a shortage is settled is also improper. [SECONDARY]
- **Overages:** no rule found. Common practice is to hold overages as store money, not cashier money, and log them. [INFERENCE]
- **Design rules that follow:**
  - Assign each drawer to one cashier.
  - Count with the cashier present, and record who counted and who witnessed.
  - Show the over/short to the cashier straight away.
  - Let the cashier type an explanation and acknowledge, but never make acknowledging a condition of closing.
  - Keep an audit trail of pay-ins and pay-outs.
  - Never offer "charge to cashier / deduct from salary". At most offer "Cashier paid it back (abono)" as a separate, voluntary, recorded repayment.

### Two-person count, safe drop, bank deposit, remote owner
- **Two-person count:** Mosaic requires supervisor authorisation twice, PH count sheets carry two signatures, and the incoming cashier acknowledges. → Offer an optional "witness" (PIN/name) on close.
- **Safe drop / pick-up:** StoreHub treats taking cash out for a bank deposit as a Pay Out ("Cash Withdrawal"). An unrecorded one shows up as a fake shortage. → A first-class "Safe drop / Remit now" movement, separate from expense pay-outs.
- **Bank deposit:** this happens outside the shift. Track "remitted to owner" → "deposited" as optional states with a deposit slip photo. [INFERENCE]
- **Remote owner:** Loyverse and StoreHub owners read shift lists (expected, actual, difference) in Back Office. → Push a "Shift closed: ₱X short" notification to the owner's phone. This fits the platform's merchant-notification bell. [INFERENCE]

---

## 4. Local copy: words cashiers actually use

Mostly native-usage knowledge [INFERENCE]. "Change fund", "turn-over", "remittance report", "cash count sheet", "declare over/short" and "vault" are confirmed in PH job postings above. Validate the rest with 2–3 real cashiers.

| Concept | Natural PH English | Taglish / Filipino | Notes |
|---|---|---|---|
| Starting float | **Change fund**, starting cash, float | **pang-sukli**, panukli, barya | "Change fund" is the dominant PH English term (job ads). "Panukli" got no web hits; "pang-sukli" is safer |
| Change given | change | **sukli** | "Kulang ang sukli" = gave too little change |
| Cash drawer / box | drawer, cash box | **kaha** | kahera/kahero = cashier |
| Count the cash | cash count, count the drawer | **bilang**, magbilang, "bilangin ang pera" | "Cash count" is used verbatim |
| Hand cash to owner | **remit**, turn over, remittance | **mag-remit**, i-remit, "pa-remit na" | Use "Remit" as the verb on the button |
| Short | short, shortage | **kulang**, "short ako ng ₱50", "na-short" | |
| Over | over, overage | **sobra**, "sumobra ng ₱20" | |
| Balanced | tally, balanced, "tama ang bilang" | **sakto**, "tugma" | "Sakto!" works well on a success screen |
| Cashier covers a shortage | pay back | **abono**, nag-abono | Keep it voluntary in the UI |
| Salary deduction | deduction | **kaltas**, bawas sa sahod | Don't put this in the UI (legal risk) |
| Expense from drawer | pay-out, petty cash, cash out | **bayad sa palengke/yelo**, "kinuha sa kaha" | Ask for a reason and a receipt photo |
| Cash added | pay-in, cash in | "dinagdagan ang barya" | |
| Mid-shift pick-up | safe drop, pick-up | "kinuha ni boss", "hulog sa vault" | |
| End of day | closing, end of day, Z / Z-reading | "sarado na", "closing na" | Owners know "Z-reading" from accredited POS |
| Theft | — | kupit | Never use in UI |

**Copy suggestions:**
- **Buttons:** "Open shift", "Remit now", "Count cash", "Close shift", "Close the day".
- **Result screens:** "Sakto! Drawer matches" / "Short by ₱120 (kulang)" / "Over by ₱40 (sobra)".
- **Float field:** "Change fund (pang-sukli) left in drawer: ₱1,000".
- **Cashier note prompt:** "Explain the difference (optional) — e.g. maling sukli, hindi na-record na bayad sa yelo".

---

## Open questions and uncertainty log
1. The exact Annex D-1/D-2 (X/Z) field list in RMO 24-2023 could not be read. Get it from bir.gov.ph before claiming any "BIR-style" layout.
2. Business day across midnight: no explicit rule either way. Vendor practice allows it. StoreHub's own docs contradict each other.
3. UTAK and Qashier shift mechanics are unverified (no public or accessible docs).
4. How GrabFood/foodpanda handle COD cash in PH is unverified.
5. IRR section number for the 20% cap (Sec. 13 vs 14) differs by edition. Use "Omnibus Rules, Book III, Rule VIII" without a section number in any user-facing text.
6. Facebook-group sentiment was not reachable. Recommend 3–5 owner and cashier interviews to validate the terms and the remote-check flow.
