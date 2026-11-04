# WebNegosyo: KPIs, dashboard design and report-builder/export research

Prepared 2026-11-05 for the analytics + reports + exports redesign. Research only; no repo code changed.

**How much to trust each source.** Vendor blogs (Toast, 7shifts, Restaurant365, Lightspeed, StoreHub, Qashier and others) are good at *definitions* but weak on *benchmarks*. Their benchmark numbers come from their own customers, mostly in the US, and nobody audits them. Philippine tax points come mostly from secondary sources (law-firm blogs, POS vendor help centres, PwC/Grant Thornton alerts). **Confirm every BIR item with a PH accountant before calling anything "BIR-compliant".** The book principles (Few, Knaflic, Tufte, Lean Analytics, Amplitude's North Star Playbook) are summarised from reviews and from what I already know, not from full-text reads.

---

## 0. TL;DR (what to build)

1. **One metric tree, not a wall of numbers.** The owner's home screen shows ONE headline: **Gross profit** when costs are known, otherwise **Net sales**. It is always shown against a named comparison ("vs same day last week"). Under it go the 3–4 levers that multiply into it:
   `Net sales = Orders × Average order value`, `Orders = Customers × Orders per customer`, `Gross profit = Net sales × Gross margin %`.
   This follows the Amplitude North Star "inputs" idea and the Lean Analytics "ratio / behaviour-changing" test. It also matches the app's existing "three levers" Reports tab.
2. **A fixed catalogue of about 45 named KPIs** (section A). Each has ONE definition, written once (extend `src/lib/reports/` + its SQL twins; never a second revenue formula). Each KPI carries metadata: plain-language label, formula, unit, "up is good / down is good / target band", whether it can be added up (additive vs distinct/ratio), the permission key (`reports` vs `costs` vs `inventory`), and the data it needs.
3. **A report builder that is really "presets + 4 knobs".** The knobs are *Measure(s)*, *Rows (group by)*, *Columns (optional pivot by period/channel/branch)*, and *Filters + Period + Compare*. Start every build from a template. Save views with **relative** periods ("last month"), which Square can't do. Put a guard so meaningless combinations can't be made (see C.4).
4. **Exports in three shapes:** a **CSV** of exactly the table on screen; an **XLSX "Accountant pack"** with multiple sheets that tie to each other (daily rows, payments, discounts incl. a Senior/PWD book, refunds/voids, items, inventory, definitions); a **one-page PDF summary**. Scheduled email can send all three: daily flash, weekly Monday recap, monthly pack on the 1st, all in Asia/Manila time.
5. **PH-specific:** every money export splits **VATable sales / VAT / VAT-exempt / zero-rated**. It lists **SC, PWD, NAAC** discounts separately, with SC/PWD computed on the VAT-exclusive price. It supports **non-VAT stores (3% percentage tax)**. It offers a **Z-reading-style daily summary**, but never labels it an official BIR Z-reading unless the store's POS is accredited (PTU/MIN). Watch **RR 11-2025 / RR 26-2025**: e-invoicing and electronic sales reporting become mandatory for POS users, with compliance extended to **31 Dec 2026**.

---

## A. Recommended KPI catalogue

Legend. **Dir** = which way is good: ↑ higher is better, ↓ lower is better, ◎ keep it inside a target band. **Key** = permission key for the screen: R=`reports`, C=`costs`, I=`inventory`, Cu=`customers`. **Add?** = can you sum it across rows/days? Y = sum; D = distinct count (re-count, never sum); R = ratio (recompute from its parts, never average the row values).

Money is integer centavos everywhere. Ratios are computed from summed numerators and denominators, never as the average of per-day ratios.

### A1. Sales (the headline group; every store has this data)

| KPI | Plain-language definition | Formula | Why an owner cares | Dir | Add? | Key |
|---|---|---|---|---|---|---|
| **Net sales** | What you actually sold food for, after discounts and before tax adjustments. The number you grow. | Per `sales-model.ts`: gross − discounts (− refunds of items). Service charge, delivery fee and tips excluded. | The base of every other ratio. Toast, Square and Shopify all lead with it. | ↑ | Y | R |
| **Gross sales** | Menu-price value of everything sold, before any discount. | Σ line price × qty (scaled to the order total, as the existing engine does) | Shows how big discounts are against the menu-price value. | ↑ | Y | R |
| **Orders** (transactions / checks) | How many orders were placed (not cancelled). | count(orders where status ∉ cancelled/void) | Traffic. One of the two multipliers of sales. | ↑ | Y | R |
| **Average order value (AOV / average check)** | What one order is worth on average. | Net sales ÷ Orders | The "spend more per visit" lever (upsells, combos). | ↑ | R | R |
| **Items per order** | How many dishes the average order has. | Σ item qty ÷ Orders | Shows whether combos and pairings work. Separates "bigger baskets" from "pricier items". | ↑ | R | R |
| **Average item price** | Average price of one dish sold. | Net item sales ÷ Σ item qty | With items per order, it decomposes AOV (AOV ≈ items/order × avg item price). | ◎ | R | R |
| **Guests / covers** *(dine-in, only if captured)* | People served (one diner = one cover). | Σ guest count (POS seats / party size) | Industry staple for dine-in. **Optional.** Hide it when not captured instead of inventing it. | ↑ | Y | R |
| **Spend per guest** | What each diner spent. | Net sales ÷ Covers | Better than AOV for dine-in parties. | ↑ | R | R |
| **Average daily sales** | Typical day's net sales in the period. | Net sales ÷ business days open | Puts weeks and months of different length on the same scale. | ↑ | R | R |
| **Sales per open hour** | Net sales per hour the store was open. | Net sales ÷ open hours (from operating hours) | Fair comparison across days and branches with different hours. A seat-free cousin of RevPASH. | ↑ | R | R |
| **Run-rate / month projection** | Where this month will land if the pace holds. | Month-to-date net ÷ days elapsed × days in month (a day-of-week-weighted version is better) | Answers the owner's real question: "will I hit my month?". | ↑ | — | R |

### A2. Adjustments & cash integrity (loss prevention, tax base)

| KPI | Definition | Formula | Why | Dir | Add? | Key |
|---|---|---|---|---|---|---|
| **Discount rate** | Share of menu-price value given away. | Discounts ÷ Gross sales | It eats margin quietly. Always split by type: **statutory (SC/PWD/NAAC)**, **promo/voucher**, **manual/staff**, **loyalty reward**. Statutory discounts aren't the owner's choice, so they must not be blamed on him. | ↓ (◎ for promo) | R | R |
| **Discount by type ₱** | Peso total of each discount kind. | Σ discount_data lines grouped by kind | Accountants need these separately (BIR asks for SC/PWD apart from the rest). | — | Y | R |
| **Void rate** | Orders or items cancelled after being entered. | Voided value ÷ (Gross + voided value). Show the count version too. | Classic theft/error signal. Vendor target: <1–2% of sales (Lightspeed/Lavu-type guides). **Rank by staff and shift**, not only in total. | ↓ | R | R |
| **Refund rate** | Money given back after a sale. | Refunds ÷ Net sales | Delaget puts the QSR average at ~0.13% of sales. Keep it separate from WebNegosyo's ledger "refund" (change returned after an edit), which is not a sales reversal. | ↓ | R | R |
| **Comp rate** *(if "comp/on the house" exists)* | Food given free after it was served. | Comp value ÷ Gross | Vendor guides: <0.5–2% of sales. | ↓ | R | R |
| **Service charge collected** | Service charge on bills. | Σ service charge | RA 11360: distributed 100% to covered staff. Kept outside net sales; reported on its own line. | — | Y | R |
| **Delivery fees collected** | Delivery fees charged to customers. | Σ delivery − delivery discount | Pass-through vs revenue. Accountants want it on its own line. | — | Y | R |
| **Collected** | Money actually received. | Σ payments (ledger) | Cash-flow truth. It can differ from net sales because of service charge, delivery, unpaid and overpaid. | ↑ | Y | R |
| **Unpaid / balance due** | Billed but not yet paid. | Σ max(0, total − paid) | Receivables (after-billing orders, tabs). | ↓ | Y | R |
| **Overpaid** | Collected more than billed. | Σ max(0, paid − total) | Reconciliation flag (already a concept in `payment-buckets.ts`). | ↓ | Y | R |
| **Payment method mix** | Share of collections by method (cash, GCash, Maya, card, bank). | Σ by method ÷ Collected | Bank reconciliation, cash-handling risk, fee planning. | — | R | R |
| **Cash over/short** *(if drawer counts exist)* | Counted cash vs expected. | Counted − (opening + cash collected − payouts) | Daily integrity check. A standard Z-reading section. | ◎ 0 | Y | R |

### A3. Profit (needs recipe costs / typed costs, i.e. the inventory ledger)

| KPI | Definition | Formula | Why | Dir | Add? | Key |
|---|---|---|---|---|---|---|
| **COGS (cost of food sold)** | What the dishes you sold cost to make, at the cost **frozen when sold**. | Σ `order_item_costs` (recipe, else typed product cost). Optionally + waste and variance (see "actual" below). | The largest controllable cost. Frozen cost means old reports never move. | ↓ | Y | C |
| **Food cost %** | Peso of ingredients per peso of sales. | COGS ÷ Net sales (food+drink; split by category for bars and cafés) | Industry's most-quoted number. Typical full-menu band 25–35% (sources vary by concept); cafés and drinks run lower. | ◎ ↓ | R | C |
| **Gross profit** | Money left after ingredients. | Net sales − COGS | Recommended **headline** once costs are set up. "Operators deposit cash, not percentages" (LeBruto et al. critique of food-cost-% thinking). | ↑ | Y | C |
| **Gross margin %** | Share of each sale you keep after ingredients. | Gross profit ÷ Net sales = 1 − food cost % | Lever #3 in the metric tree. | ↑ | R | C |
| **Costed coverage** *(data-quality KPI)* | How much of sales has a known cost. | Net sales of costed lines ÷ Net sales | **Show it next to every profit figure.** If only 60% of sales is costed, margin numbers mislead. A NULL frozen cost = "not recorded". | ↑ (→100%) | R | C |
| **Contribution margin per item (CM)** | Peso profit on one plate. | Item price (net of its discount share) − item cost | Menu engineering's profitability axis (Kasavana & Smith). Better than item food-cost %. | ↑ | per item | C |
| **Theoretical vs actual food cost variance** | Food that left the shelf beyond what recipes say should have. | Actual usage (opening + received − closing, at frozen cost) − Theoretical (Σ sold × recipe cost); also ÷ Net sales | Catches waste, over-portioning, theft and bad recipes. Guides: under ~2% of sales = well run; above 5% = something systematic. Needs stocktakes. | ↓ | Y | C+I |
| **Waste %** | Logged waste value vs sales. | Σ waste movements × frozen cost ÷ Net sales | Actionable part of variance. | ↓ | R | C+I |
| **Stock value on hand** | Peso value of what is on the shelves. | Σ current_qty × current avg cost | Cash tied up. Accountants need closing inventory for the P&L. | ◎ | point-in-time | C+I |
| **Days of stock (inventory days)** | How many days current stock lasts at the recent usage rate. | Stock value ÷ average daily COGS (trailing 28d) | Over-buying vs stock-out risk. | ◎ | — | C+I |
| **Labor cost %** *(only with owner-entered payroll)* | Wages as a share of sales. | Labor cost ÷ Net sales | Industry ~25–35% (7shifts 29–33% average; NRA medians reportedly 36.5% FSR / 31.7% LSR in 2024, secondhand). WebNegosyo has shifts but not wages. Offer an "enter monthly payroll" field instead of guessing. | ◎ ↓ | R | C |
| **Prime cost %** | Ingredients + labor as a share of sales. | (COGS + labor) ÷ Net sales | The single most-cited restaurant health number. Common target ≤60%, trouble at ≥65%. Only when labor is entered. | ↓ | R | C |
| **Sales per labor hour (SPLH)** | Sales each staff hour produced. | Net sales ÷ clocked hours (staff shifts) | Uses the shift data that already exists, no wages needed. Compare against yourself; there is no reliable public benchmark. Labor % = hourly wage ÷ SPLH. | ↑ | R | R |
| **Break-even daily sales** *(planning card)* | Sales needed per day to cover costs. | Fixed monthly costs ÷ gross margin % ÷ days open | The owner's "minimum day" (Roger Fields-style budgeting). Needs owner-entered fixed costs. | — | — | C |

### A4. Menu (product mix & menu engineering)

| KPI | Definition | Formula | Why | Dir | Add? | Key |
|---|---|---|---|---|---|---|
| **Product mix % (PMIX / menu mix)** | Each dish's share of dishes sold within its menu group. | item qty ÷ Σ qty in category (or whole menu) | Popularity axis of the matrix. | — | R | R |
| **Item net sales & rank** | What each dish earned. | Σ item net | Best sellers by money vs by count can differ. Show both. | ↑ | Y | R |
| **Menu-engineering class** | Star / Plowhorse / Puzzle / Dog. | **Popular** if mix % ≥ 70% × (100% ÷ N items in the group). **High CM** if item CM ≥ the group's *weighted* average CM (Σ CM×qty ÷ Σ qty). Kasavana & Smith 1982. | Tells the owner what to do: keep Stars visible, reprice/re-cost Plowhorses, promote or reposition Puzzles, drop or replace Dogs. Run **within a category** (mains vs drinks); mixing groups distorts it. Needs ≥ ~4 weeks of sales. Without costs, fall back to price as a margin proxy and **label it so** (the MCP already does this). | — | per item | C (R for popularity-only) |
| **Profit factor** (Pavesic) | Item CM as a share of the menu's average CM. | item CM ÷ weighted avg CM | Easier to read than raw CM. ">1 = earns more than average." | ↑ | per item | C |
| **Total contribution per item** | Profit the dish brought in the period. | CM × qty | Ranks dishes by what they *added to the bank*. Pavesic's weighting. | ↑ | Y | C |
| **Category mix** | Share of net sales by category. | category net ÷ net | Drinks share is a classic margin lever for cafés. Use category-at-sale (NULL before 2026-10-12 → "by current menu"). | — | R | R |
| **Add-on / modifier attach rate** | How often orders include a paid add-on (or a specific one). | orders with ≥1 paid add-on ÷ orders. Per item: lines of item X with an add-on ÷ lines of item X. | Cheap revenue. Define the denominator clearly (orders vs lines; any add-on vs a specific group). | ↑ | R | R |
| **Add-on revenue** | Peso from paid add-ons. | Σ add-on prices × qty | Shows the money behind the attach rate. | ↑ | Y | R |
| **Category attach rate** (e.g. drink attach) | Orders that include at least one drink or dessert. | orders with category X ÷ orders | "Do people order a drink with their meal?" Easy staff coaching number. | ↑ | R | R |
| **Combo take rate** | Share of orders containing a combo. | orders with a bundle ÷ orders | Boost Sales outcome. | ↑ | R | R |
| **Upsell acceptance** | Offers shown vs taken (upgrade, pairing, last-call). | accepted ÷ shown (by source: `inline_upgrade`, `post_add`, `checkout_modal`) | Already tracked as analytics sources. Show alongside the extra pesos earned. | ↑ | R | R |
| **Pair lift** | How much more likely two dishes are bought together than by chance. | P(A∧B) ÷ (P(A)·P(B)) | Already computed (`pair-insights.ts`). Use it as the "Picked together" explainer. | ↑ | — | R |
| **Out-of-stock hours / sold-out count** | How often a dish was unavailable. | Σ hours flagged unavailable (manual or auto-86) | A proxy for lost sales; pairs with inventory. | ↓ | Y | I |

### A5. Customers & loyalty

Only named orders count. Always show the identified share so owners know how much of the picture they're seeing.

| KPI | Definition | Formula | Why | Dir | Add? | Key |
|---|---|---|---|---|---|---|
| **Known-customer share** | Share of orders tied to a customer (phone/name/member). | named orders ÷ orders | Caveat on every customer KPI. Also a lever ("capture more numbers"). | ↑ | R | Cu |
| **Customers (unique)** | Different people who ordered. | distinct customer_id in period | Traffic quality. **Never sum across days** (D). | ↑ | D | Cu |
| **New customers** | First-ever order in this period. | customers whose first order ∈ period | Acquisition. | ↑ | D | Cu |
| **Returning customers** | Ordered before this period and again in it. | customers with an order < period start and ∈ period | Retention. Use the per-ORDER split already chosen (first ever order = first-timer). | ↑ | D | Cu |
| **Repeat rate** | Share of customers who came back within N days of a first visit. | customers with a 2nd order within 30/60/90 days of their 1st ÷ customers with a 1st order old enough to judge | The single best loyalty number. Toast's vendor data puts a typical guest's return rate around 7%, and loyalty members near 30% (directional only). Use a cohort so recent first-timers aren't counted as "didn't return" yet. | ↑ | R | Cu |
| **Orders per customer (frequency)** | Average visits per customer in the period. | named orders ÷ unique customers | Lever #2 in the metric tree. | ↑ | R | Cu |
| **Revenue from regulars** | Share of sales from repeat customers. | net of returning customers' orders ÷ net of named orders | Toast: ~7% of guests can drive up to half of order volume. Shows the owner how concentrated his sales are. | ↑ | R | Cu |
| **Lapsed customers** | Regulars who haven't come back in X days (X ≈ 2–3× their usual gap). | count | Drives the win-back SMS automation. Turns the number into an action. | ↓ | D | Cu |
| **Customer lifetime value (simple)** | What an average customer is worth over time. | AOV × orders per customer per month × expected months (≈ 1 ÷ monthly churn). **Profit version** × gross margin %. | Justifies loyalty and SMS spend. Show it as a range or "to date", never as false precision. | ↑ | — | Cu |
| **Loyalty member share of sales** | Share of sales from stamp-card members. | members' net ÷ net | Program reach. | ↑ | R | Cu |
| **Reward redemption rate** | Earned rewards actually claimed. | redeemed ÷ earned (or issued) | Too low = rewards aren't attractive. Too high = check margin. | ◎ | R | Cu |
| **Cost of rewards** | Peso value of free items/discounts from loyalty. | Σ reward discounts (+ COGS of free items) | Program ROI. | ↓ | Y | C |

### A6. Time & capacity

| KPI | Definition | Formula | Why | Dir | Add? | Key |
|---|---|---|---|---|---|---|
| **Peak hours heatmap** | Sales/orders by day-of-week × hour. | Σ net by (dow, hour) over ≥4 weeks, Manila time | Staffing, prep and promo timing. The heatmap is the most useful single chart for small shops. | — | Y | R |
| **Day-of-week index** | How each weekday compares to an average day. | avg net on weekday ÷ avg net of all days | "Tuesdays are 60% of a normal day." Targets slow-day promos. | — | R | R |
| **Service-period split** | Breakfast/lunch/merienda/dinner/late. | Σ by configurable time bands | Speaks the owner's language better than raw hours. | — | Y | R |
| **Ticket / prep time** | Order placed → ready (KDS/prep ETA). | median(ready − placed) | Speed drives turnover and delivery ratings. Use the median, not the mean. | ↓ | R | R |
| **Table turnover** *(dine-in with tables configured)* | Times each table was used. | parties seated ÷ tables (per service) | Classic dine-in metric. Only when table data exists. | ↑ | R | R |
| **RevPASH** *(dine-in with seat count)* | Revenue per available seat-hour. | Net sales ÷ (seats × open hours) | Kimes' revenue-management KPI. It combines occupancy and spend, and academics note it hides which driver moved. Show occupancy and spend per guest beside it. **Advanced only**; most WebNegosyo stores are takeaway, delivery or counter. | ↑ | R | R |

### A7. Channels & branches

| KPI | Definition | Formula | Why | Dir | Add? | Key |
|---|---|---|---|---|---|---|
| **Channel mix** | Share of net sales by channel: web storefront, POS/counter, QR table, Messenger, Grab/Foodpanda kinds, delivery vs pickup vs dine-in. | channel net ÷ net | Where business comes from. The existing engine guarantees Σ channels = net. | — | R | R |
| **AOV by channel** | Order value per channel. | channel net ÷ channel orders | Online usually has higher AOV, which strengthens the case for pushing your own channel. | ↑ | R | R |
| **Aggregator take** *(if commission % entered)* | What Grab/Foodpanda kept. | channel gross × commission % (+ markup already priced in) | "Is my own web channel saving me money?" Order-type POS pricing already models markups. | ↓ | Y | C |
| **Branch ranking** | Branches compared fairly. | per-branch net, AOV, orders, GP, **per open hour** | Multi-branch owners. Normalise by trading hour (the branch-management redesign already does this). | ↑ | — | R |
| **Same-store sales growth (comps)** | Growth of branches open ≥ 12 months only. | (this period − same period last year) ÷ last year, matched branches | Separates real growth from "we opened a new branch". | ↑ | R | R |

### A8. Growth comparisons (applied to any KPI, not KPIs of their own)

- **vs same day last week (SDLW)**: Toast's daily default. Weekday effects are strong in food, so a weekday needs a matching weekday.
- **vs last week / week-to-date vs same point last week** (the comparison must be cut to the same elapsed time).
- **MoM** (month-to-date vs the same number of days last month, day-of-week aligned if possible), **YoY** (same calendar period last year; and same-weekday-aligned 364 days back for weekly views).
- **Trailing 4-week average** as a steadier baseline than a single prior day.
- Show **absolute change (₱)** and **% change**. For ratios show **percentage-point** change ("food cost 31% → 33%, +2 pts"), never "% of a %".

### A9. PH tax/compliance figures (in exports and the Z-style summary, not the home dashboard)

| Figure | Definition / formula |
|---|---|
| **VATable sales** | VAT-inclusive taxable sales ÷ 1.12 |
| **VAT amount (output VAT)** | VATable sales × 12% |
| **VAT-exempt sales** | Sales to SC/PWD (their exclusive consumption) and VAT-exempt items, **VAT-exclusive**. BIR older guidance (RR 7-2010 / RMC 38-2012) shows the exempt amount *including* the discount; confirm with an accountant. |
| **Zero-rated sales** | 0% VAT (rare for restaurants; diplomats). |
| **VAT adjustment** | VAT removed from sales because of SC/PWD (and voids/refunds). |
| **SC discount / PWD discount** | 20% × (price ÷ 1.12) for the senior's or PWD's share. Mixed groups are pro-rated per diner (RMC 38-2012). One discount per person even if both SC and PWD. |
| **NAAC discount** | 20% for PSC/POC-accredited national athletes and coaches (RA 10699). Computed on the VAT-exclusive price at VAT stores, **but NOT VAT-exempt** (PwC). Vendors disagree, so confirm. |
| **Solo parent** | RA 11861 / RR 1-2023: 10% + VAT exemption on baby milk, food supplements, diapers and medicines. **Generally not restaurant meals.** Don't build it into food checkout. |
| **Percentage tax base** *(non-VAT stores)* | Gross receipts × 3% (Sec. 116, quarterly 2551Q) for stores under the ₱3M VAT threshold not on the 8% option. Their receipts must not show VAT. |
| **Accumulated grand total** | Running total since go-live. A Z-reading staple: "previous" + today = "present". |
| **Beginning / ending invoice no.** | First and last order/invoice number of the day. |

---

## B. Dashboard & report design principles (for non-analyst owners, often on a phone)

Each principle comes with its source and how it would apply in WebNegosyo.

1. **Answer "Am I OK today?" in 5 seconds, one screen.** *(Few: dashboards are for at-a-glance monitoring; mistake #1 is exceeding a single screen.)* The phone home screen is a single scroll-free block: headline + 3 levers + one alert. Everything else is a tap away.
2. **One headline, a metric tree under it.** *(Lean Analytics OMTM; Amplitude North Star: one metric + 3–5 input metrics that teams can move.)* Headline = Gross profit (or Net sales until costs exist). Inputs = Customers, Orders per customer (came back), AOV, Gross margin %. A tap on an input opens its breakdown. This decomposition *is* the navigation.
3. **Every number gets context, or it gets removed.** *(Few mistake #2 "inadequate context"; Lean Analytics "comparative".)* Each card states the comparison in words: "₱18,420 · ▲ ₱2,100 (+13%) vs last Friday". No bare numbers.
4. **Prefer ratios and rates for decisions, totals for reassurance.** *(Lean Analytics: a good metric is a ratio and changes behaviour.)* Show "spend per order" and "came back %", not just totals. Ask of every card: "what would the owner do differently if this moved?" If nothing, cut it or bury it.
5. **Colour means good or bad, and almost nothing else.** *(Few #12 misuse of colour; Knaflic preattentive attributes.)* Grey by default. Green/red only on the delta, driven by the KPI's **Dir** metadata (food cost up = red). Never red/green alone (colour-blind safe): add ▲▼ and words.
6. **Declutter ruthlessly.** *(Tufte data-ink ratio / chartjunk; Knaflic "eliminate clutter"; Few #11.)* No gauges, 3D, donut forests or gridlines. Use direct labels instead of legends. Round to whole pesos on dashboards (Few #3 "excessive precision"); exports keep centavos.
7. **Sparklines and bullet graphs over big charts.** *(Few; Tufte.)* KPI card = value + delta + 7/28-point sparkline over the *same* period as the number. A bullet graph for targets (food cost vs 30% target band). Sparklines side by side must share a scale or say they don't.
8. **Pick the chart by the question.** *(Knaflic "choose an appropriate visual".)* Trend → line; ranking → sorted horizontal bar (names are long Filipino dish names, so horizontal fits phones); part-of-whole with ≤5 parts → stacked bar; when/peak → dow × hour heatmap; menu engineering → the 2×2 scatter with labelled quadrants.
9. **Say the "so what" in a sentence.** *(Knaflic "Big Idea", "tell a story"; Duarte.)* Each section gets a generated plain-language line: "Tuesdays are your slowest day, 40% below average. Try a Tuesday combo." It must be deterministic and honest: no invented numbers (same rule as `write-copy.ts`/`launch-copy.ts`). It links to an action (Boost Sales, SMS win-back, reprice).
10. **Actions beside insights.** *(Lean Analytics "behaviour-changing"; the app's "Bring them back" pattern.)* Lapsed customers → "Text them". Dog dish → "Hide/replace". Plowhorse → "Raise price ₱10?". Puzzle → "Feature it".
11. **Consistent, named periods with a single switch.** *(Card-pattern research: state the comparison window on the card; one period switch updates every card.)* Today / Yesterday / This week / Last week / This month / Last month / Custom. Always business days in Asia/Manila. Handle after-midnight closing (business-day cut-off setting).
12. **Show the data's limits honestly.** "Costs set for 72% of sales". "Customer numbers cover 41% of orders". "Category before 12 Oct shown by current menu". Few #4 "deficient measure" is often an *unflagged partial* measure.
13. **Avoid meaningless variety.** *(Few #6.)* The same card component, the same delta language and the same colour logic everywhere (web, app, email, PDF).
14. **Arrange by importance; top-left first.** *(Few #9; NN/g F-pattern, secondhand.)* Order: headline → levers → alerts → breakdowns. On phones, a single column in the same order.
15. **Progressive disclosure: summary → breakdown → transactions.** Every number drills to the rows that make it up, ending in orders, so the owner can trust it. Toast/R365 "tie-out" culture: totals must reconcile with what the owner sees in the order list.
16. **Benchmarks: own history first, industry second, and labelled.** Industry bands (food cost 25–35%, prime ≤60%, voids <1–2%) appear as faint reference bands with "typical range (US data)". The comparison that matters is the store against itself (7shifts and R365 both advise this).
17. **Mobile specifics.** Thumb-reachable period switch; cards ≥44 px tap targets; no horizontal scroll except deliberately in pivot tables (sticky first column); pesos abbreviated (₱18.4k) only on the dashboard; landscape not required.
18. **Fast or nothing.** A dashboard that times out isn't used. Pre-aggregate per day (the plan's Part 2 SQL aggregation); keep report windows bounded (≤93 days for raw SQL today). Longer ranges and exports run from daily rollups or as async jobs.
19. **Language.** Plain English with optional Taglish labels (as SMS recipes do). Avoid jargon on the home screen: say "Spend per order", not "AOV"; "Came back", not "Retention". Keep the technical term in the definition tooltip and the exports.
20. **Every metric has a definition one tap away.** The same text appears in the export's Definitions sheet (single source: the KPI registry).

---

## C. Report builder + export spec

### C.1 What other tools do (pattern scan)

| Tool | Choose fields | Pivot | Save | Schedule | Export | Takeaway |
|---|---|---|---|---|---|---|
| **Shopify** (Analytics → New exploration / ShopifyQL) | Metric, dimension, filter and visualization pickers that *write a query*; power users type ShopifyQL; Sidekick turns English into a query | Dimensions such as Month as a breakdown; compare-period columns side by side | "Save as" → custom report, owned by its creator | Not native (apps) | CSV | **Pickers over a query language. An "ask in English" layer is now expected.** |
| **Square** custom reports | Blocks (Key stats, Sales summary, Payment methods, Item, Category, Team, Discounts, Modifiers, Taxes); add/remove columns per block | Limited | Saved, but **date filters can't be saved** | Only the daily/monthly sales-summary email | CSV ("selected" or "all columns"); no XLSX/PDF; custom reports can't be printed | **Blocks are a friendly mental model. Don't copy the gaps (saved periods, scheduling, XLSX).** |
| **QuickBooks Online** | Customize → Columns (show/hide/reorder) + Filters → Run → "Save customization" | Columns by month/quarter on P&L-type reports | Named custom reports in **groups** | **Groups emailed on a schedule**, HTML or attached Excel | Excel, PDF | **Report groups + schedule = the "accountant pack" pattern.** |
| **Xero** | Layout editor, tracking categories, Date + **Compare** dropdowns | Compare N periods as columns | Custom/published reports | (third-party/limited) | PDF, Excel, Google Sheets | **The "Compare: previous N periods" dropdown makes the pivot cheaply.** |
| **Metabase** | Summarize (metrics) + Group by (breakouts) + filters | Pivot table viz with nested rows/columns and automatic subtotals; totals toggle | Saved questions → dashboards | Subscriptions | CSV/XLSX/PNG | **Summarize + Group-by is the cleanest grammar. A pivot is just "a second group-by on columns".** |
| **Looker Studio** | Drag fields to Dimension (blue) / Metric (green) | Pivot table chart | Reports | **Schedule delivery: PDF daily/weekly/monthly** | PDF, Sheets, CSV | **Colour-code dimensions vs metrics so non-analysts learn the difference.** |
| **Airtable / Notion views** | Filter, sort, group, hide fields; a view = saved config over the same data | Grouping (collapsible) | Collaborative / Personal / Locked views | — | CSV | **"Views" (not "reports") is the most familiar idea for normal users: personal vs shared vs locked.** |
| **Toast / R365 / Loyverse (restaurant POS)** | Fixed reports: Sales summary, Product mix, Discounts, Voids, Payments, Labor, Taxes, Shifts, Modifiers | PMIX compare weeks | Weekly/daily performance emails (SDLW, 4-week average) | Nightly email | CSV; R365 GL export (JE no, date, account, debit, credit, location) | **Restaurant owners expect a *named fixed set* plus a nightly email. Builders are for the 10% case.** |

### C.2 Product shape

**Reports home = Presets ("Start from…").** The fixed, well-designed reports come first, and each one can be opened in the builder ("Customize"):

- Daily flash (yesterday vs same day last week): sales, orders, AOV, discounts, voids, top 5 items, payment totals, cash over/short.
- Sales summary (gross → net waterfall, adjustments, collected, unpaid).
- Items (product mix; with costs: CM, menu-engineering class).
- Categories · Add-ons & modifiers · Combos & upsells.
- Payments by method · Discounts by type (incl. Senior/PWD book) · Refunds & voids (by staff).
- Hours & days (heatmap) · Channels · Branches.
- Customers (new vs returning, repeat cohort, lapsed, top customers) · Loyalty.
- Inventory: stock on hand & value, movements, waste, variance, reorder.
- Tax summary (VAT breakdown / percentage tax) · Z-style daily summary.
- Accountant pack (monthly).

**Builder = 4 knobs + period.** Square's "blocks" metaphor is too rigid. Metabase/Looker grammar works, but with friendlier words:

1. **Show** (measures; multi-select from the KPI registry, grouped as in section A, with definitions inline). Blue chips = measures.
2. **Split rows by** (dimension, ≤2 levels): Day/Week/Month · Day of week · Hour · Item · Category · Add-on · Payment method · Channel/Order type · Branch · Staff/Cashier · Customer · Discount type/code · Table. Green chips = dimensions.
3. **Spread columns by** (optional pivot, ≤1): Month / Week / Day of week / Channel / Branch / Payment method. Example: rows = Item, columns = Month, value = Qty or Net. Caps: 13 months, 14 weeks, 31 days, 7 dow, 24 hours, ≤12 categories, then "Other".
4. **Filter**: branch, channel, order type, category, item, payment method, staff, customer type (new/returning/member), discount type, status (include voids?).
5. **Period + Compare**: presets + custom range. Compare = previous period / same period last year / SDLW. With a pivot, "compare" adds Δ columns.

Outputs: **table** (default; sticky first column; totals row; sortable) with an optional **chart** toggle (line for time rows, horizontal bar for categorical rows). Every cell drills to its orders.

**Natural-language entry (optional, later):** "items by month this year" → fills the knobs. Shopify Sidekick sets this expectation, and Owl already has tool-calling. The knobs remain the truth, so the model never writes SQL.

### C.3 Saved views

- **Name, icon, owner. Visibility:** Just me / Shared with store / Locked (owner-only edit), the Airtable pattern. Shared views are filtered per viewer's permission. A staff member without `costs` sees cost columns removed, not zeros. Branch-locked accounts always get their own branch, whatever the saved view says (same rule as `report-context.ts`).
- **Save periods as relative** ("Last month", "Last 7 days", "Month to date"), with an "absolute range" option. This fixes Square's documented gap.
- Pin to home (≤3), duplicate, rename, delete. Store as a validated JSON spec (zod), versioned, re-validated on read like `tracking_style`: `{version, measures[], rows[], columns?, filters{}, period{kind, …}, compare?, chart?}`.
- Presets are just locked system views using the same spec, which keeps everything one code path.

### C.4 Guards (what makes builders safe for non-analysts)

- **Additivity metadata decides totals.** Y measures sum. D measures (unique customers) are re-counted for the total row, never summed. R measures (AOV, food cost %, attach rate) are recomputed from the summed numerator and denominator. This is the commonest builder bug.
- **Incompatible combos are greyed out with a reason.** Examples: "Spend per order" split by *Item* is meaningless, so offer "Average item price". "Repeat rate" by *Hour* doesn't make sense. Payment-method splits apply to Collected, not Net sales (payments ≠ lines).
- **Money split by item** uses the existing line scaling so Σ items = net exactly. Payment totals use `payment-buckets.ts`. One definition (CLAUDE.md rule).
- **Bounded queries.** Rows ≤ 5,000 on screen (paged); periods beyond the raw-SQL window come from daily rollups; heavy pivots and exports run as background jobs with a "we'll email/notify you" fallback. Live probes: `statement_timeout` discipline.
- **Data-quality footnotes** are added automatically (costed coverage, known-customer share, pre-2026-10-12 category note, Convex/tenant-DB stores not covered).

### C.5 Scheduled delivery

| Schedule | Default content | Format | When (Asia/Manila) |
|---|---|---|---|
| **Daily flash** | Yesterday vs SDLW: net, orders, AOV, GP (if costed), discounts, voids/refunds, top 5 items, payments, cash over/short, one "so what" line | Email body (HTML, phone-first) + optional push/Messenger | 07:00 next day (after the business-day cut-off) |
| **Weekly recap** | Week vs last week & 4-week avg; best/worst day; menu movers; customers new/returning; lapsed regulars count → link to win-back | Email + PDF summary | Monday 07:00 |
| **Monthly accountant pack** | Full XLSX (C.6) + PDF summary | XLSX attachment (or a signed link if large) | 1st of month 08:00 for the previous month; re-send button after late edits |
| **Any saved view** | That view | CSV or XLSX | Daily / weekly (pick day) / monthly (pick date) |

Rules: recipients are store members, plus up to N external emails (e.g. the accountant) with explicit owner confirmation. External recipients get only exports and no login (QuickBooks emails HTML/Excel to anyone). Unsubscribe link. Skip or send "no orders yesterday" (configurable). Use signed, expiring links for large files. Log each send. Respect the permission keys of the person who created the schedule at send time; if they lost `costs`, cost columns are dropped.

### C.6 Export formats

**CSV ("export this table").** It contains exactly the columns on screen, or "all available columns" (Square's two options).
- UTF-8 **with BOM** so Excel on Windows shows ₱ and ñ correctly. ISO dates (`2026-11-05`) plus a separate weekday column. Numbers without thousands separators or currency symbols. Money in pesos with 2 decimals (`1234.50`). Percentages as decimals in a column suffixed `_pct` or as `12.5`, documented.
- Use one human-readable header row whose labels stay the same across releases, so people's spreadsheets and formulas don't break. Don't add a second "keys" row, because it breaks Excel's sorting and filtering.
- Include filters, period and generated-at in the **filename** (`webnegosyo_items_2026-10-01_2026-10-31_branch-makati.csv`), since CSV has no metadata sheet.

**XLSX "Accountant pack" (multiple sheets; the main deliverable).** Every sheet ties to Summary. A "Checks" block proves it, like R365's tick-marks against the POS report.

| Sheet | One row per | Columns |
|---|---|---|
| **1 Summary** | — | Store legal name, TIN, VAT status (VAT / non-VAT), branch(es), period, generated at, timezone. **Gross → net waterfall:** Gross sales, − Promo/voucher discounts, − Statutory discounts (SC, PWD, NAAC), − Manual discounts, − Loyalty rewards, = Net sales; + Service charge; + Delivery fees (net of delivery discounts); = Total billed; Collected; Unpaid; Overpaid. **VAT:** VATable sales, VAT, VAT-exempt sales, zero-rated, VAT adjustment (or Percentage-tax base & 3% for non-VAT). **Profit:** COGS (frozen), Gross profit, Gross margin %, Costed coverage %. Counts: orders, voided orders, refunds. **Checks:** Σ daily = summary; Σ items = net; Σ payments = collected. |
| **2 Daily sales** | business day | Date, weekday, orders, guests (if any), gross sales, discounts by type (columns), refunds, net sales, VATable sales, VAT, VAT-exempt, zero-rated, service charge, delivery fees, total billed, collected **per payment method (one column each)**, unpaid, overpaid, COGS, gross profit, margin %, first/last order no., voids (count, ₱), cash over/short. *This is the sheet accountants post from: one journal entry per day.* |
| **3 Payments** | payment (or day × method) | Date/time, order no., method, reference no., amount, cashier, branch, status (incl. refunds/change) |
| **4 Discounts** | discount line | Date, order no., type (SC/PWD/NAAC/voucher/manual/loyalty), code/reason, approver, items affected, amount |
| **5 SC/PWD sales book** | statutory-discount transaction | Date, invoice/order no., name, OSCA/PWD ID no., TIN (if given), gross sales (VAT-incl.), VAT-exempt sales, VAT removed (12%), discount (20%), net amount paid. (Fields from RA 9994 IRR / RR 16-2018 receipt rules; confirm the exact BIR column layout.) NAAC in its own section (PNST ID; not VAT-exempt). Reuse the existing gov-discounts ledger; include reversals and late syncs as flagged rows. |
| **6 Refunds & voids** | event | Date/time, order no., item, qty, amount, reason, staff, approver, before/after payment |
| **7 Items** | item (× variant optional) | Category (at sale), item, qty, gross, discounts, net, avg price, unit cost (frozen avg), COGS, gross profit, margin %, mix %, menu-engineering class |
| **8 Categories / Channels / Branches** | dimension | Net, orders, AOV, GP, share |
| **9 Inventory** | ingredient (× branch) | Opening qty & value, received (qty, ₱), used by sales, waste, transfers in/out, stocktake adjustments, closing qty & value (at frozen cost), theoretical vs actual variance. Needs `inventory` + `costs`. |
| **10 Orders** (optional, large) | order | Order no., date/time, channel, order type, branch, customer (masked unless `customers`), gross, discounts, net, service, delivery, total, paid, status |
| **11 Definitions** | KPI | Name, definition, formula, notes: rounding (centavo largest-remainder), timezone, business-day cut-off, data caveats (uncosted lines, category pre-2026-10-12, refunds booked on refund date vs sale date) |

XLSX details: frozen header row, autofilter, numeric cells (not text), peso number format `₱#,##0.00`, percentages formatted, totals rows as real `SUM` formulas *or* values plus a Checks block (values are safer; formulas break when users sort), and sheet names ≤31 chars. Large packs are generated async and fetched via a signed link.

**PDF one-page summary.** For the owner, a bank or a landlord, and for printing:
- Header: store, branch, period, generated-at. Headline + 4 levers with deltas; a gross → net waterfall table; payments by method; VAT block; top 10 items; daily sales sparkline/bar; a single "so what" line.
- Fixed A4 portrait, readable in grayscale, no interactivity. Same numbers as Summary (one engine).

**Optional later:** a **GL journal CSV** (R365-style: JE no., date, account, debit, credit, branch, memo) with an owner-editable account map (Sales–Food, Sales–Beverage, Discounts–SC/PWD, Output VAT, Service charge payable, Cash, GCash clearing, Card clearing, COGS, Inventory). Also a **Google Sheets push**. Both are highly valued by bookkeepers but not needed for v1.

### C.7 Z-reading-style daily summary (PH expectation)

Owners in the Philippines know X-reading (mid-shift snapshot, no reset) and Z-reading (end of day, sequential, uneditable, issued even on zero-sales days). StoreHub's breakdown of a Z-reading, which is a good template:

- **Header:** store, VAT REG TIN, accreditation/PTU, MIN, serial no., **Z counter no.**, reset counter, **previous / present accumulated sales (grand total)**, beginning and ending invoice no.
- **Sales:** VATable sales, VAT amount, VAT-exempt sales, zero-rated sales, gross amount, less discounts, less refunds, less voids, less VAT adjustment, net amount.
- **Discount summary:** SC, PWD, NAAC, Solo Parent, other/promo.
- **Service charge** (separate; outside net amount, inside collections).
- **Collections by payment method** (count + amount), total collections.
- **Cash:** opening fund, pay-in, withdrawals, expected cash in drawer, short/over.

**Recommendation.** Offer a "Daily closing summary (Z-style)" with these sections, printable on the receipt printer and exportable. Label it *"for your records; not an official BIR Z-reading"* unless and until WebNegosyo's POS is BIR-accredited (PTU per machine, MIN, sequential non-resettable counters, e-journal, audit trail).
- The accumulated grand total and the Z counter need an **append-only daily close record**: once closed, a day's numbers are frozen. Late edits then show as next-day adjustments, which is exactly what BIR-style tapes do. Toast, by comparison, books refunds on the refund date.
- **Strategic flag:** RR 11-2025 (CREATE MORE, e-invoicing + electronic sales reporting) covers POS users; RR 26-2025 extended compliance to 31 Dec 2026. The detailed e-sales reporting spec was still to be issued. Merchants will ask about this in 2026, so a PH tax adviser review belongs on the roadmap.

### C.8 PH correctness checklist for every money export

- VAT and non-VAT stores render differently: non-VAT shows no VAT lines and does show a percentage-tax base. Drive this from `store_tax_profiles`.
- SC/PWD: remove VAT first, then 20% (net = price ÷ 1.12 × 0.8). Group meals are pro-rated per diner. One 20% per person. Online claims are OFF by default (already enforced).
- NAAC: 20% on the VAT-exclusive price at VAT stores; the VAT stays (verify).
- Solo parent: not on restaurant food. Don't offer it at checkout.
- Service charge: its own line; legally distributed to staff (RA 11360). Treatment in the VAT/percentage-tax base is contested between sources, so show it separately and let the accountant decide.
- Delivery fee: its own line. Aggregator orders: show gross, and commission if the owner has entered it.
- Every day appears, including zero-sales days (BIR-style expectation), with business-day cut-off and Asia/Manila time.

### C.9 Suggested build order

1. KPI registry (metadata above) + additivity-aware totals. Reuse `sales-model.ts` / `payment-buckets.ts` / report SQL twins.
2. Home metric tree + daily flash email.
3. Presets reworked onto one view spec; CSV export of any table.
4. Accountant pack XLSX (Summary, Daily, Payments, Discounts, SC/PWD book, Items, Definitions) + PDF summary + monthly schedule.
5. Builder (rows / columns / filters / compare) + saved views (relative periods, visibility).
6. Inventory/profit sheets, menu-engineering classes, variance.
7. Z-style daily close (append-only) + GL journal export + optional natural-language entry via Owl.

---

## Sources

**KPIs & restaurant finance**
- Prime cost: [Restaurant365, How to calculate prime cost](https://www.restaurant365.com/blog/how-to-calculate-prime-cost-in-a-restaurant/), [R365 prime cost accounting](https://www.restaurant365.com/blog/prime-cost-accounting-explained/), [Toast prime cost](https://pos.toasttab.com/es-us/blog/on-the-line/restaurant-prime-cost), [Lightspeed prime cost formula](https://lightspeedhq.com/blog/restaurant-prime-cost-formula), [Fourth](https://www.fourth.com/article/restaurant-prime-cost), [MarginEdge food cost benchmarks](https://www.marginedge.com/blog/how-to-benchmark-your-restaurants-food-costs-against-industry-standards), [Synergy: reading a restaurant P&L](https://www.synergyconsultants.com/blog-posts/how-to-read-a-restaurant-p-l-in-todays-restaurant-economy)
- Menu engineering: [Loaded matrix explainer](https://www.loadedhub.com/resources/menu-engineering-matrix-restaurant), [meez](https://www.getmeez.com/blog/menu-engineering-matrix), [eCornell contribution margin PDF](https://s3.amazonaws.com/ecornell/content/SHA/SHA507/sha507_137_cntrbmrgaspct_en-us.pdf), [FIU Hospitality Review (LeBruto et al.)](https://digitalcommons.fiu.edu/record/17973/files/V13n195e.pdf), [FIU Fall 2007 review](https://digitalcommons.fiu.edu/record/18216/files/Fall2007_7.pdf), [Pavesic method study](https://koreascience.kr/article/JAKO200503018545179.page?lang=en), [AHLEI menu engineering](https://ahlei.servsafebrands.com/resources-overview/news-and-insights/the-power-of-menu-engineering-part-two)
- RevPASH: [7shifts](https://www.7shifts.com/blog/revpash-for-restaurants/), [SevenRooms](https://sevenrooms.com/blog/restaurant-revpash/), [Hospitality Net critique](https://www.hospitalitynet.org/opinion/4117170.html), [Palgrave 2023 paper](https://doi.org/10.1057/s41272-023-00446-6), [Cornell eCommons](https://ecommons.cornell.edu/server/api/core/bitstreams/3effded4-d653-488d-b744-5b98b42def79/content)
- Labor/SPLH: [7shifts SPLH](https://www.7shifts.com/blog/restaurant-sales-per-labor-hour-splh/), [7shifts labor cost](https://www.7shifts.com/blog/restaurant-labor-cost/), [Pilla SPLH](https://yourpilla.com/blog/sales-per-labour-hour), [R365 crucial data](https://www.restaurant365.com/blog/how-to-calculate-your-crucial-restaurant-data/)
- Customers: [Toast customer retention](https://pos.toasttab.com/blog/data/restaurant-customer-retention), [Toast loyalty return rate](https://pos.toasttab.com/blog/data/restaurant-loyalty-program-return-rate), [Bloom Intelligence CLV](https://bloomintelligence.com/restaurant-customer-lifetime-value/), [ChowNow CLV](https://get.chownow.com/blog/restaurant-customer-lifetime-value/)
- Attach rate: [Pulse RevOps upsell/attachment](https://pulserevops.com/tools/tl0184), [Reelo beverage attach rate](https://reelo.io/glossary/beverage-attach-rate/), [HubSpot attach rate](https://blog.hubspot.com/sales/attach-rate)
- Voids/comps/discounts: [Delaget Loss Prevention Index](https://www.delaget.com/wp-content/uploads/formidable/2/Delaget-Restaurant-Loss-Prevention-Index.pdf), [R365 reduce comps & voids](https://www.restaurant365.com/blog/how-to-reduce-restaurant-comps-and-voids/), [Lavu void/comp tracking](https://lavu.com/how-to-handle-restaurant-pos-void-and-comp-tracking/), [Metabase restaurant dashboard](https://www.metabase.com/dashboards/restaurant-sales)
- Food cost variance: [Toast actual vs theoretical](https://pos.toasttab.com/blog/on-the-line/actual-vs-theoretical-food-cost), [Altametrics variance](https://altametrics.com/blog/how-to-calculate-food-cost-variance-in-your-restaurant.html), [meez](https://www.getmeez.com/blog/actual-vs-theoretical-food-costs)
- Turnover/covers/comps: [Toast table turnover](https://pos.toasttab.com/blog/on-the-line/table-turnover-rate), [Toast covers](https://pos.toasttab.com/blog/on-the-line/restaurant-cover), [Same-store sales (Wikipedia)](https://en.wikipedia.org/wiki/Same-store_sales)
- Flash/comparisons: [Toast flash report](https://pos.toasttab.com/blog/on-the-line/restaurant-flash-report), [Toast weekly dashboard](https://support.toasttab.com/en/article/How-to-Use-the-Toast-Reporting-Dashboard), [Toast weekly performance email (SDLW)](https://support.toasttab.com/en/article/Weekly-Performance-Summary-Email-FAQs)
- Sales definitions: [Toast Sales Summary FAQ](https://support.toasttab.com/en/article/Sales-Summary-FAQ?lang=en_US), [Toast refunds in reporting](https://support.toasttab.com/en/article/How-Do-Refunds-Appear-in-Toast-Reporting)
- Book: [Restaurant Success by the Numbers (PRH)](https://www.penguinrandomhouse.com/books/226866/restaurant-success-by-the-numbers-second-edition-by-roger-fields-cpa/). The book's formulas could not be verified online; the break-even and check-average formulas above are the standard versions.

**Dashboard design**
- [Information Dashboard Design (Analytics Press)](https://analyticspress.com/idd.php), [Information Lab review of Few](https://www.theinformationlab.co.uk/community/blog/information-dashboard-design-stephen), [BI book: dashboard principles](https://ljkelly3141.github.io/bi-book/15.4-dashboard-design-principles.html), [PatternFly sparkline guidelines](https://patternfly.org/charts/sparkline-chart/design-guidelines), [SaaS KPI card patterns](https://www.saasui.design/blog/saas-metric-kpi-card-ux-patterns)
- [Storytelling with Data summary (Readingraphics)](https://readingraphics.com/storytelling-with-data/), [O'Reilly listing](https://oreilly.com/library/view/storytelling-with-data/9781119002253)
- [Lean Analytics ch.2 (O'Reilly)](https://www.oreilly.com/library/view/lean-analytics/9781449335687/ch02.html), [Holistics Lean Analytics part 1](https://holistics.io/blog/lean-analytics-part-1-an-introduction-to-analytical-thinking)
- [Amplitude North Star Playbook](https://amplitude.com/books/north-star/about-north-star-framework), [Amplitude leading vs lagging](https://www.amplitude.com/blog/map-your-metrics), [Good vs bad North Star](https://www.amplitude.com/blog/good-bad-north-star-metric)

**Report builders & exports**
- [Shopify new reports](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/new-analytics/new-reports), [ShopifyQL first query](https://shopify.dev/docs/apps/build/shopifyql/build-your-first-query.md), [Shopify B2B report example](https://help.shopify.com/en/manual/b2b/b2b-reports)
- [Square custom reports help](https://squareup.com/help/us/en/article/8362), [Square scheduled export idea thread](https://community.squareup.com/t5/Reporting/Data-exporting-to-Excel-and-similar-or-a-scheduled-export/idi-p/615836)
- [QuickBooks customize reports](https://quickbooks.intuit.com/learn-support/en-us/run-reports/customize-your-reports-in-quickbooks-online/00/186382), [QuickBooks save customized report / groups / schedule](https://quickbooks.intuit.com/learn-support/en-us/help-articles/memorize-reports/00/261890)
- [Xero custom reports (Fit Small Business)](https://fitsmallbusiness.com/print-reports-in-xero/), [Xero product ideas](https://productideas.xero.com/forums/967133-reports-tax?page=15)
- [Metabase summarizing & grouping](https://www.metabase.com/docs/master/questions/query-builder/summarizing-and-grouping), [Metabase pivot tables](https://www.metabase.com/docs/master/questions/visualizations/pivot-table)
- [Looker Studio scheduled reports (Loves Data)](https://lovesdata.com/blog/setting-up-automated-reports-in-looker-studio)
- [Airtable views](https://support.airtable.com/docs/getting-started-with-airtable-views.md)
- [Loyverse export](https://help.loyverse.com/help/exporting-data-from-loyverse-account), [Loyverse sales by item](https://help.loyverse.com/help/sales-item-report-back-office)
- [R365 GL sales export](https://radar.help.restaurant365.com/support/solutions/articles/12000096530-restaurant365-gl-sales-export), [R365 daily sales summary review](https://restaurant365.freshdesk.com/support/solutions/articles/12000039073-classic-daily-sales-summary-review), [SaaSAnt: Z-out to QuickBooks/Xero](https://www.saasant.com/blog/pos-daily-sales-to-quickbooks-xero/)

**Philippines / BIR**
- [StoreHub: understanding the Z-reading](https://care.storehub.com/en/articles/13399056-how-to-understand-your-z-reading-report), [StoreHub BIR reports in BackOffice](https://care.storehub.com/en/articles/13398964-how-to-view-and-download-bir-reports-pos-backoffice), [Qashier BIR special discounts & audit reports](https://support.qashier.com/en/articles/14815420-philippine-bir-compliance-special-discounts-receipts-audit-reports), [Mosaic BIR Sales Summary](https://mosaic-solutions.helpscoutdocs.com/article/52-back-office-bir-sales-summary-report), [Respicio: POS audit trail](https://www.respicio.ph/commentaries/audit-trail-requirements-for-pos-accreditation-in-the-philippines), [Roque Law: CRM/POS receipt format](https://roquelaw.com.ph/?p=1718)
- [PwC Tax Alert 29 (RR 26-2025)](https://www.pwc.com/ph/en/tax/tax-publications/tax-alerts/2025/tax-alert-29.html), [Grant Thornton: CREATE MORE e-invoicing / e-sales reporting](https://www.grantthornton.com.ph/insights/articles-and-updates1/tax-notes/create-more-mandatory-use-of-electronic-invoicing-and-electronic-sales-reporting-with-allowable-deduction/), [BusinessWorld: shift to e-invoicing](https://www.bworldonline.com/economy/2026/05/18/750488/the-shift-to-e-invoicing-and-electronic-sales-reporting/)
- SC/PWD: [RMC 38-2012 (Davao City copy)](https://seniorcitizen.davaocity.gov.ph/index.php/republic-act-9994-page-4), [Respicio SC computation](https://www.respicio.ph/commentaries/senior-citizen-discounts-in-the-philippines-rules-and-sample-computation), [GMA: DSWD group sample](https://www.gmanetwork.com/news/news/nation/92078/dswd-warns-restaurants-vs-violating-senior-citizens-law/story/), [Inquirer: DOJ on PWD group meals](https://newsinfo.inquirer.net/1992599/doj-clarifies-application-of-pwd-discounts-for-group-meal-purchases/amp), [Jur.ph RA 9994 tax privileges](https://jur.ph/law/summary/implementing-tax-privileges-republic-act-9994-senior-citizens)
- NAAC / Solo parent: [PwC on NAAC 20%](https://www.pwc.com/ph/en/tax/tax-publications/taxwise-or-otherwise/2021/a-much-deserved-privilege.html), [PwC on solo parents](https://www.pwc.com/ph/en/tax/tax-publications/taxwise-or-otherwise/2023/the-perks-of-being-single.html), [Conventus: solo parent discounts & VAT](https://conventuslaw.com/report/philippines-solo-parents-discounts-and-vat-exemption/)
- Service charge / percentage tax: [Respicio: service charge & VAT](https://www.respicio.ph/commentaries/are-service-charges-distributed-to-employees-subject-to-value-added-tax), [Lawyer-Philippines: tax on service charges](https://www.lawyer-philippines.com/articles/tax-on-service-charges-in-the-philippines), [Batas Natin: percentage tax vs VAT](https://batasnatin.com/laws/a2ba1faf-2d5a-4d92-8f45-ff4fd75929cb)
