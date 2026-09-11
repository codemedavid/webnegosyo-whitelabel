# Loyalty receipt progress and missed completion recovery

## Observed failure

SeaCook order `jh70mwef055zxzpv1r27sp1v1d8e4bbw` was delivered in Convex, but
`customer_external_orders` still said `ready`, with no completion timestamp.
There was no loyalty earn row. Displaying the card alone could not fix the zero
balance: the loyalty engine was reading an unfinished visit.

The web completion notification was best-effort, did not keep requests alive
across navigation, and ignored unsuccessful HTTP responses. The exact reason
this particular notification was lost was not recorded.

## Changes

- Receipt progress uses the order's saved phone before the current order earns.
  Checkout form contact data is a fallback; private identity stays server-side.
- The initial page passes progress into the client. Successful QR claims switch
  to the refreshed card, and polling catches earning that settles later.
- For a completed Convex receipt with no live earn row, the server reconciles
  the existing customer-order projection from the authenticated Convex read,
  then uses the ordinary loyalty qualification and idempotent ledger writer.
- The observation timestamp is captured before the backend read so a newer
  lifecycle event cannot be overwritten by that snapshot.
- Old Convex orders have no completion timestamp. Recovery only considers
  programs already active when the order was placed, avoiding retroactive
  credit from opening receipts predating a program. Missing customer projections
  are not invented. An existing earn row skips recovery on subsequent reads.
- Web lifecycle notifications use keepalive and report HTTP errors. If a
  notification is still lost, receipt progress can recover it on a later read.

## Verification

- Tests reproduced pending progress returning null and a QR confirmation staying
  at zero despite refreshed progress; both now pass.
- A service integration test reproduces Convex `delivered` / projection `ready`,
  exercises lifecycle sync and earning, and verifies one stamp over repeat reads.
- Additional checks cover unfinished orders, newer cancellation events, program
  activation boundaries, tenant isolation, token validation, and no phone leakage.
- 403 tests passed across 29 loyalty, lifecycle, receipt, and page suites.
- The actual SeaCook receipt was verified in the local browser: `1 of 10 stamps
  toward ₱200 off`, exactly one filled slot, no phone prompt. The database has one
  non-shadow earn row with delta 1 and the projection now says `delivered`.

Local code only; no web or Convex deployment was performed. Opening the supplied
local receipt reconciled that order in the configured database through the normal
loyalty ledger operation. No manual balance edits were made.
