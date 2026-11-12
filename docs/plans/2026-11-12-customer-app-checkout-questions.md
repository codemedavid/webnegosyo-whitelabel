# Customer app: the store's own checkout questions (P4b)

Status: APPROVED + BUILT 2026-11-12 — 14-day date picker, role questions filled by the server, live Pick up test on sample-demo. Proof: 890 order types with questions on platform, 0 left unanswerable (read-only check); simulator Pick up order on sample-demo carried pickup_date, qa_pickup_day=2026-11-13, qa_bag (cancelled after).

## Why

The order engine refuses an order that leaves one of the order type's required
checkout questions blank (`judgeRequiredAnswers`, merged from main). The web
checkout asks those questions; the app asks none. So on any store with a
required question beyond name / phone / delivery address, every app order of
that order type fails with "<question> is required" and nothing to fill in.

Found on the simulator run: sample-demo's Pick up asks a required
`pickup_date`. Platform count (2026-11-12): **41 of 308 active stores** have a
required custom question. Some are a renamed version of a question the app
already knows ("Contact Number", "Customer Name", "Delivery Address"); the
server still refuses those, because it checks the field's own name.

## What changes

### Server (`src/lib/app-api/`, contract in `src/lib/app-contract/`)

1. **Questions in the catalog.** A bounded read of `customer_form_fields` for
   the store, run beside the order-types read. It is projected per order type
   as `catalog.questions[]`:
   - `{ id, orderTypeId, name, label, type, required, placeholder, options }`;
   - `type` is one of `text | textarea | number | email | phone | choice | checkbox | date`.
     A `select` becomes `choice`. A choice question with no options, and any
     unknown type, is asked as `text` (same rule as the register).
   - Left out:
     - questions whose name the server owns (`ANSWER_KEYS_THE_SERVER_CANNOT_SEE`);
     - **role questions** (next step).

   The catalog version (ETag) changes when the questions change.

2. **Role questions answered by the server.**
   - A question whose name means the customer's name, phone or delivery
     address gets its answer from the session profile or the chosen delivery
     place. The same aliases as the register apply (`fieldRole`: "Contact
     Number", "Full name", "Complete address"…), written under the question's
     own name.
   - The app never asks them twice, and the merchant sees the answer under
     their own label.
   - The alias list becomes one shared module (`src/lib/checkout/question-roles.ts`).
     A parity test pins it to the register's copy (`webnegosyo-app/lib/pos-checkout-fields.ts`).
   - Table number stays a normal question the app asks.

3. **Answers on the draft.** `AppOrderDraft.answers?: Record<string, string>`:
   - at most 40 keys, each value at most 500 characters;
   - kept only for custom questions of the chosen order type, everything else
     dropped;
   - spread FIRST in customerData, so `customer_name` / `customer_phone` /
     delivery keys / `notes` always win (as on the register).
   - Older app builds send none, and nothing changes for them.

4. **Refusals point at the question.** A refusal for missing answers already
   carries `fieldErrors` (`RefusedOrder.fieldErrors`). The 422 passes them on
   as `error.details.fieldErrors`, so the app marks the exact question.

### App (`customer-app/`)

5. **"A few more details" section** in checkout, between "Your details" and
   Payment, shown only when the chosen order type has questions. Controls by type:
   - text / textarea / number / email / phone: text inputs with the matching keyboard;
   - choice: chips, pick one;
   - checkbox: a switch, ticked = `yes`;
   - date: a sheet of the next 14 days. The answer is stored as `YYYY-MM-DD`,
     like the web's date input. No new native module (works in Expo Go and OTA).

   The section also:
   - shows the store's label, placeholder and "Optional" / required mark;
   - keeps answers in the cart store per question id, so switching order type
     and back keeps them;
   - clears answers with the bag after an order.

6. **Blockers.** A required question left blank adds "Answer “<label>”" to the
   place-order bar, like the existing blockers. A server `fieldErrors` refusal
   shows under the matching question.

7. **Fixtures** for the prototype build get a sample question per order type.

## Not in scope

- The owner's format rules (`validation_rules`: length, digits). The server
  checks presence only, exactly like the web's server check. The app uses the
  right keyboard but enforces no rules (`required-answers.ts` already
  documents this).
- Scheduling / advance orders (a separate store feature), and rewards at
  checkout (P5b).

## Proof

- **Unit tests:**
  - the projection (types, options, role and server-owned names left out);
  - role filling (every alias in the register's list);
  - answer filtering, and that app keys win;
  - the fieldErrors pass-through;
  - the app section, blockers and date sheet;
  - contract sync + parity.
- **Simulator on sample-demo:**
  - a Pick up order answering `pickup_date` reaches platform with
    `customer_data.pickup_date` set;
  - the order is cancelled after;
  - an unanswered required question blocks in the app.
- **Live read-only check:** run the catalog projection for all 41 stores, and
  confirm every required question is either asked by the app or answered by the
  server.

## Decisions for the owner

1. **Dates:** a "next 14 days" picker (recommended) or free text?
2. **Role questions:** answer "Contact Number" / "Customer Name" style
   questions automatically from the signed-in profile (recommended)?
3. **Live test:** one Pick up order on sample-demo, cancelled after (recommended)?
