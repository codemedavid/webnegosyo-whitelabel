# Loyalty wallet passes: rules for this folder

<!-- Moved verbatim from the root CLAUDE.md on 2026-11-11. The root file's rules for every change
     (Platform Supabase First, verification, conventions) still apply here. -->

## Loyalty wallet passes (Apple Wallet / Google Wallet)

A loyalty member can add their stamp card to Apple or Google Wallet from the order-tracking page (`AddToWalletButtons` inside `LoyaltyStampCard`); the POS attaches a guest by scanning it (`CustomerPickerSheet` → `MemberCardScanner`).

- **Engine** `src/lib/loyalty/wallet-pass/` (pure parts tested in `tests/unit/loyalty/wallet-pass/`): `content` renders ONE platform-neutral card (both wallets draw from it; its sha256 decides whether anything is pushed), `apple-pass-json` / `google-objects` format it, `apple-ws-route` + `apple-ws-handler` implement Apple's PassKit web service, `sync-plan` decides who hears about a change.
- **Identity**: a pass carries only a random 144-bit serial (QR `WNLC1.<serial>`), never the phone. Passes are issued ONLY for a receipt proven by its tracking token, for the number already on that order (`resolveOrderLoyaltyMember`, shared with the stamp card) — never for a typed number. Apple's per-pass token is HMAC-derived (`WALLET_PASS_AUTH_SECRET`), not stored.
- **Keeping cards current**: pg_net triggers on `loyalty_balances` / `loyalty_entitlements` / `loyalty_programs` post an id to `/api/loyalty/passes/sync` (ids only, everything re-read; gated by `X-Wallet-Sync-Secret` = Vault `wallet_pass_sync_secret` = env `WALLET_PASS_SYNC_SECRET`). Apple = APNs empty push with the pass certificate, device then pulls; Google = PATCH the object. Per-wallet watermarks (`apple_pushed_hash`, `google_synced_hash`); Google is only called for members who asked for a Google pass.
- **Routes**: `GET /api/loyalty/passes/{apple,google}` (issue), `/api/loyalty/passes/apple-ws/v1/...` (device web service), `POST /api/loyalty/passes/sync`, `POST /api/loyalty/passes/identify` (bearer, same tenant + `pos`).
- **Config** (`config.ts`) fails closed per wallet; see ENV_VARIABLES_NEEDED.txt. Swap the text buttons for Apple's/Google's official badge artwork before launch.
