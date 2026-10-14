# SMS Automations — product plan

Status: **PLAN — awaiting approval** (2026-10-12). No code written yet.

## 1. The problem, in one paragraph

A store owner should be able to say "text my guests when X happens" once and then
forget about it: a review request a few hours after an order, a nudge when a loyalty
card is almost full, a reminder about a reward they haven't claimed, a "we miss you"
after a month away. Today our SMS feature can only send **calendar blasts** that a
person has to start by tapping **Send** on an Android phone. It has no events, no memory
of who was already texted, and no loyalty or review content. Automations need their own
engine, built from parts we already own.

## 2. What exists today (and the roast)

| Area | Today | Verdict |
|---|---|---|
| Where it lives | Merchant app only → Reports → Guest list → "Campaigns" segment, Android only | **Buried.** Three taps deep, behind a segment control on a guest list. No web screen at all. |
| What it can do | Scheduled filter-blasts (one-off / every N days / weekly), 5-step wizard, test send, Send now | Fine for promos. **Wrong tool for follow-ups.** |
| Sending | Merchant taps Send; phone sends 25 per run with 2.5s gaps | Never automatic. |
| Dedupe | Only "not twice in the same run" | **Bug-class:** an every-14-days win-back texts the same lapsed guests every 14 days, forever. Every manual Send re-texts everyone. `recentlyTextedPhones` exists in the code but nothing fills it. |
| Stuck runs | A halted run stays `claimed` forever | **Bug:** that occurrence can never be picked up again. |
| Reminder notification | Carries `campaignId` | Tapping it probably goes nowhere (push router only knows announcements + stock). |
| Onboarding drafts | "A week after their first order", "Slipping regulars"… | **Misleading:** labelled like triggers, actually repeating blasts. |
| Message variables | name, store, order count, total spent, last visit | Nothing about loyalty, rewards, reviews or links. |
| Opt-out | Per-guest toggle; tenant-wide suppressions have no screen | No way for a guest to reply STOP. |
| AI (Owl) | Can draft a one-off campaign, pause one | Can't build anything recurring or automatic. |
| Adoption (live DB) | 17 campaigns, 4 active, **25 SMS sent ever** | The feature isn't being used. The reason is friction, not demand. |

Reach reality check (live DB, last 30 days): **613** consented guests across 75 stores;
only **~850 of 15.5k orders** carried a phone (most are walk-in POS sales).
**176 earned rewards are unclaimed** right now, so "your reward is waiting" is the
best first automation. About 4.7k orders stay `confirmed` forever and orders have no
`completed_at`, so delays must count from **when the order was placed**, never from
"delivered".

Assets we reuse: the always-on Android sender (foreground service + headless JS,
built for loyalty codes, restarts on boot), the native `sendSms`, the loyalty ladder
math (`nextRewardStep`), the customers table (works for every order backend), Owl's
two-phase propose/confirm pattern, and the tested template renderer and segment counter.

## 3. What the best tools do (research summary)

Klaviyo, Toast, Square, Postscript, Attentive, Shopify, Thanx (sources in the research
notes):

- **Recipes with switches, not a canvas** (Toast: one Automations page, 9 types, all toggles).
- **One cap across all automations** (Toast 28 days; Klaviyo Smart Sending 24h), so overlapping flows can't pile onto one guest.
- **A re-entry rule per automation** (Klaviyo: never / every time / after X days; Thanx: one win-back *ever*).
- **Exit when they order** (Postscript cancellation trigger).
- **Turning on never blasts the backlog silently.** Klaviyo asks "Add past profiles?"; Attentive ramps 1%/day.
- **Quiet hours hold messages; they don't drop them** (Postscript).
- Defaults: win-back 30 days (Toast) / regular-gone-quiet 3 orders + 6 weeks (Square); review request to repeat guests (Square); reward expiry 14 days before (Square).
- **Honest results:** "ordered within 7 days after the text", not "revenue caused".

Anti-patterns: canvases; ambiguous "does turning this on text existing people?";
per-flow caps only; inflated attribution; a STOP footer that doesn't actually work.

## 4. Product design

### 4.1 Information architecture

Rename the area to **Texts** and give it a real home in the merchant app.
It becomes a door in Reports, beside Guest list and Rewards, and is linked from Loyalty
and from "Bring them back".

```
Texts
├─ Sender card ........ "This phone sends your texts · On · 14 sent today · 3 waiting"
├─ Automations (default tab)
│   ├─ After a visit:   Review request · Thank first-timers
│   ├─ Loyalty:         Almost there · Reward waiting · Reward expiring
│   └─ Bring them back: We miss you · Regulars gone quiet
├─ One-time texts ..... existing campaigns (promos, announcements)
└─ Activity ........... sent / waiting / skipped (with reasons), cancel a waiting text
   ⚙ Texting rules .... quiet hours, 1 text per guest every N days, daily limit,
                         opt-out line, review link, sender phone
```

Configuring works on **iOS and Android** (the engine runs on the server). Only the
*sender* needs an Android phone.

### 4.2 The automation card (list)

```
[icon] Review request                                   [ ON ]
       3 hours after an order → ask for a Google review
       23 sent this week · 5 came back · next: 2 waiting
```

Recipes that are off show as **"Ready to turn on"** with a reason drawn from the
store's own data, e.g. "You have 14 unclaimed rewards". One tap opens setup with
everything pre-filled.

### 4.3 The editor: one screen that reads like a sentence

This is not the 5-step wizard. Each recipe is a sentence with blanks:

> **When** a guest is **[2]** stamps away from a reward, **[1 day]** after their last visit
> **Text them:** "Hi {{firstName}}! {{stampsLeft}} more stamps and your {{rewardName}} is free 🎉 {{loyaltyLink}}"
> **Only** [everyone with SMS consent ▾]
> **At most** once per reward
> **How it runs:** ● Automatically while the sender is on ○ Only when I tap Run

- A live preview renders with a **real guest** from the store, plus a character and segment count.
- Variable chips include `stampsLeft`, `rewardName`, `reviewLink`, `loyaltyLink`, `favoriteItem` and `daysSinceLastVisit`.
- Templates come in English and Taglish, with an "✨ Write it for me" button.
- Bottom bar: **Text me a test** · **Save & turn on**.

**Turning on or Run now always shows the backlog question.** Nothing goes to people
who already qualify without being asked:

```
23 guests already qualify today.
 ● Text them too — about 50 min from this phone (paced, quiet hours respected)
 ○ Only guests who qualify from now on
[ Preview the 23 ]                     [ Turn on ]
```

Manual mode ("Only when I tap Run") shows **Run now · 23 qualify**. That covers the
"trigger it myself and everyone who matches today gets it" case. The same dedupe means
a guest who already got this occurrence is never texted twice.

### 4.4 Recipes (v1)

| Recipe | Fires when | Default | Re-entry (default) | Exit |
|---|---|---|---|---|
| Review request | N hours after an order (not cancelled) | 3h, repeat guests only (toggle: everyone) | once per 30 days | — |
| Thank first-timers | N days after a first order, no second order yet | 5 days | once per guest | they order |
| Loyalty: almost there | ≤K stamps from the next reward, N days after the last stamp | K=2, 1 day | once per reward step | they order |
| Loyalty: reward waiting | reward issued and unclaimed for N days | 3 days | once per reward (one reminder) | claimed |
| Loyalty: reward expiring | reward expires within N days | 7 days | once per reward | claimed |
| We miss you | no order in N days | 30 days (presets 30/45/60) | once per absence | they order |
| Regulars gone quiet | ≥3 orders, none in N days | 21 days | once per absence | they order |

Birthday is not included because we don't collect birthdays. It's listed in §9 as a
possible follow-up.

### 4.5 Texting rules (store-wide, sensible defaults, rarely touched)

- **Consent is mandatory and not an option.** The guest needs `sms_consent`, must not be opted out, and must not be suppressed. The editor shows "120 of 340 guests can be texted" and explains why the rest can't.
- **Per-guest cap across ALL automations:** at most 1 automated text per guest every **3 days**. When two automations want the same guest, the priority is reward waiting/expiring > review > almost there > first-timer > win-back. A capped guest is retried later, never dropped silently. Review requests expire after 24h because a late one is worse than none.
- **Quiet hours** 9pm–8am Manila: messages are **held** until morning.
- **Daily limit** per store (default 100). Pacing is ~25 per 30 min, because Android limits a non-default SMS app to about 30 texts per 30 minutes per phone. Every backlog prompt shows an honest ETA.
- **Opt-out line** "Reply STOP to stop texts" is appended to marketing recipes. Phase 5 makes a STOP reply actually opt the guest out; until then the line is off by default so we don't promise something we can't do.
  - **Revised 2026-10-14:** a STOP *reply* needs Android's RECEIVE_SMS, which the app deliberately does not request (`webnegosyo-app/plugins/withSmsPermissions.js`: it makes the app a restricted-permission app on every channel). The opt-out is planned as a one-tap **"Stop texts" link** instead (short link → web page → suppression), which needs no permission and works on every phone. Needs the owner's OK before building.
- **Review link:** a new store setting (Google review URL / Facebook page), offered on first use of the review recipe.

## 5. Architecture

```
            (cron, every 5 min)             (Android sender, background)
customers / orders / loyalty ──► Planner ──► sms_outbox ──► claim → send → finish
          ▲                         │  dedupe by occurrence      │
          │                         ▼                            ▼
   Run now / Turn on ──► same planner (backlog mode)   sms_outbox.status + results
```

**The server decides who gets texted; the phone only delivers.** Why:
- The phone can't see more than 1000 customers.
- Loyalty math lives on the server.
- The AI and the web need the same rules.
- Dedupe has to be enforced by the database, not by whichever phone happens to be awake.

### 5.1 Data (one migration, platform Supabase)

- **`sms_automations`**: `id, tenant_id, recipe (check), name, params jsonb, audience jsonb, message_template, run_mode ('auto'|'manual'), reentry_days, status ('on'|'off'), source ('owner'|'ai'|'onboarding'), created_by, timestamps`.
- **`sms_outbox`** (generic; the loyalty OTP outbox stays untouched):
  - Columns: `id, tenant_id, automation_id, customer_id, phone_e164, body, occurrence_key, status (queued|claimed|sent|failed|skipped|expired|cancelled), skip_reason, not_before, expires_at, lease_token, lease_expires_at, claimed_by_device, sent_at, error`.
  - **UNIQUE (automation_id, customer_id, occurrence_key).** This one constraint is all the dedupe.
- **`sms_settings`** (per tenant): quiet hours, cap days, daily limit, opt-out line, `review_url`.
- **RPCs:** `claim_sms_outbox_message(device, credential)` (lease, per-device lock, heartbeat), `finish_sms_outbox_message`, `recover_sms_outbox_message`.
- **RLS:** select/update status for `customers`-permission staff. Enqueue happens only through the service role.
- **Occurrence keys:**
  - review = order id
  - win-back = `last_order_at`, so each absence fires once and ordering resets it naturally
  - almost-there = program + cycle + step
  - reward waiting/expiring = entitlement id

### 5.2 Engine (`src/lib/sms-automations/`, pure + unit tested)

- `recipes.ts`: a registry with defaults, copy (EN/TL), variables and priority. Adding a recipe means editing the registry, and one contract test runs over every entry.
- `eligibility.ts`: consent, opt-out, suppression, cap, daily limit.
- `occurrence.ts` and `planner.ts`: candidates → enqueue rows plus skip reasons.
- `render.ts`: extends the existing renderer with loyalty variables via `nextRewardStep`, and links.
- `quiet-hours.ts`: computes `not_before`.

### 5.3 Server

- `POST /api/sms/automations/tick`: Vercel cron every 5 min with `CRON_SECRET`.
  - Only stores with an automation on are processed.
  - Queries are indexed and bounded, and page past the 1000-row cap.
  - Stale queued rows are marked `expired`.
- `GET|POST /api/sms/automations[...]`: list, save (zod), status, preview (count + sample guests + ETA), run-now/backfill. These are bearer-wrapped (`withRequestBearer`), like Owl's routes.
- Platform first (CLAUDE.md rule). The customers table is shared across all backends, so win-back and loyalty work everywhere. Order-anchored recipes (review) read `orders` on platform stores and fall back to `customers.last_order_at` on Convex and tenant-Supabase stores.

### 5.4 Sender (merchant app)

- The existing headless gateway loop gets a second queue. Loyalty codes always go first; then it claims `sms_outbox`, paced under Android's limit.
- Gateway enrollment is decoupled from `loyalty_enabled`, so a store without loyalty can still turn on the sender. The permission for marketing claims is `customers`.
- The sender card moves to **Texts** and shows On/Off, which phone, last seen, sent today and waiting. When the phone is off and texts are waiting, the owner gets a local notification.
- **Needs an EAS binary:** OTA is dead, so the app ships by binary only.

## 6. AI

- **Owl tools:**
  - `get_sms_automations` (list, stats, sender status).
  - `propose_sms_automation` (create/edit: recipe, params, message, mode; validated by the same zod schema; card shows preview + "23 qualify").
  - `propose_sms_automation_status`.
  - `propose_run_sms_automation` (backlog send).
  - All use the two-phase Confirm and need a new `assistant_actions` kind. They are mirrored in the app's `presentation.ts` and `links.ts`.
- **"Build me a loyalty follow-up"** → one proposal card. Confirm → live.
- **"✨ Write it for me"** in the editor: OpenRouter writes the message in the store's voice. Output is validated (length, only known variables, no invented claims, the same rule as `launch-copy.ts`).
- **MCP** (superadmin): `create_sms_automation` and `list_sms_automations`.
- **Onboarding:** replace the 4 repeating draft blasts with the matching automations, created **off** and "Ready to turn on".

## 7. Cleanup (things we remove or change)

- Remove the follow-up presets (win-back, slipping, second visit) from the One-time texts goal step; automations own those now. One-time texts keep promo and announcement.
- Reports "Bring them back" opens the matching **automation**, not a new campaign.
- Fix campaign cross-run dedupe: fill `recentlyTextedPhones` from the per-guest cap.
- Fix the stale claimed run (take over after a lease).
- Fix routing when the reminder notification is tapped.
- The 4 existing **active** campaigns are left alone. Their owners see a one-time hint: "This repeats to the same people — switch to the automation?"

## 8. Phases

| # | Phase | Ships via |
|---|---|---|
| 1 | Data + engine + tick + outbox RPCs, TDD; migration applied and probed on platform; RLS tested as anon / authenticated / service | web deploy |
| 2 | Sender: gateway second queue, decoupled enrollment, sender card | EAS binary |
| 3 | Texts hub, automations list, sentence editor, backlog sheet, Activity, Texting rules, review-link setting, campaign cleanup | EAS binary |
| 4 | AI: Owl tools, MCP, Write-it-for-me, onboarding automations | web deploy (+ app mirror) |
| 5 | Results (sent / skipped / came back / ₱ ordered after) + short links with click counts; opt-out **link** (revised from an inbound STOP receiver — see 4.5) | web |
| 6 | (optional) Web admin `/admin/texts` with the same screens | web deploy |

**QA after each phase:**
- Unit tests for every pure module.
- Live DB probes for objects and RLS as each role.
- A dry-run tick against real tenants that **enqueues nothing and prints who would be texted and why**.
- An independent review agent plus a "roast" pass on the UI.
- A device checklist: gateway on, reboot, airplane mode, 30/30min limit, quiet hours, STOP.

## 9. Not in v1

Birthday (no data), multi-step sequences ("text again 3 days later"), A/B tests,
coupons generated per text (vouchers exist, so this is a good v2), branch-scoped audiences
(`customers` has no `outlet_id`), and paid Semaphore sending for automations (can be added
later behind the same outbox).
