# TDD Evidence — AI Growth Coach

**Feature:** Alex Hormozi–style AI growth advisor on the merchant app Growth tab.
**Source:** inline `/ecc:plan` output (this session); journeys derived during the TDD run.

## User journeys

1. As a merchant, I want to enter a monthly revenue target so the coach can tell
   me exactly how many more orders/day or how much higher an average ticket it
   takes to hit it — using my own numbers.
2. As a merchant, I want the coach to diagnose my real bottleneck (customers /
   ticket size / margin) and prescribe the fastest lever, streamed live.
3. As a merchant, I want a one-tap way to book a 1:1 consultation on Messenger.
4. As the platform, I want the OpenRouter key to never ship to the device and
   only authenticated merchants to spend AI tokens.

## Task report

| Task | Summary | Command run | RED → GREEN |
|---|---|---|---|
| Fact builder (`lib/growth-coach.ts`) | Pure, PII-free facts payload + target parsing | `npx jest -t growth-coach` | RED: `TS2307 Cannot find module './growth-coach'` → GREEN: 18/18 |
| SSE parser (`lib/sse-parse.ts`) | Buffered `data:` delta extraction, chunk-split safe | `npx jest -t sse-parse` | GREEN: 8/8 |
| Edge function (`supabase/functions/growth-coach`) | JWT-authed streamed OpenRouter proxy | manual (Deno) — see gaps | n/a |
| Streaming hook (`hooks/use-growth-coach.ts`) | `expo/fetch` stream → `answer`, abort-safe | typecheck + manual | n/a |
| UI card + wiring | Target input, streamed answer, Messenger CTA, demo gate | `npx tsc --noEmit` | 0 errors |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | `"500k"`, `"₱500,000"`, `"1.5m"` parse to pesos; empty/zero/negative → null | `lib/growth-coach.test.ts` | unit | PASS |
| 2 | Facts carry actual perf, monthly gap, scale-target math (rounded) | `lib/growth-coach.test.ts` | unit | PASS |
| 3 | Margin omitted when unknown; customers converted to % return rate | `lib/growth-coach.test.ts` | unit | PASS |
| 4 | Top-5 products by revenue; unnamed/zero-revenue rows dropped | `lib/growth-coach.test.ts` | unit | PASS |
| 5 | `hasData=false` with no orders; feature flags default false | `lib/growth-coach.test.ts` | unit | PASS |
| 6 | SSE deltas extracted in order; `[DONE]`/comments ignored | `lib/sse-parse.test.ts` | unit | PASS |
| 7 | A line split across two chunks is recombined, no token lost | `lib/sse-parse.test.ts` | unit | PASS |
| 8 | Garbled JSON is skipped without throwing | `lib/sse-parse.test.ts` | unit | PASS |

## Coverage & known gaps

- **Full suite:** `npx jest` → **187 passed / 187**. `npx tsc --noEmit` → **0 errors**.
- Pure logic (fact builder, SSE parser) is fully unit-covered — the same policy
  as the rest of `lib/` (jest is node-only here; screens/hooks are exercised
  manually via Expo, per `jest.config.js`).
- **Untested (manual/integration):** the edge function (Deno runtime) and the
  `expo/fetch` streaming hook. Verify on a dev build: Growth tab → enter ₱500k →
  watch the plan stream → tap "Book a 1:1 consultation".

## Deployment / config checklist

- `supabase secrets set OPENROUTER_API_KEY=…` (and optional `GROWTH_COACH_MODEL`).
- `supabase functions deploy growth-coach`.
- Set `EXPO_PUBLIC_CONSULTATION_MESSENGER_URL` to the real m.me handle
  (defaults to `https://m.me/webnegosyo`).
- **Verify** `google/gemma-4-26b-a4b-it` exists on OpenRouter; the function
  auto-falls back to `meta-llama/llama-3.3-70b-instruct` on a 400.

## Merge evidence (RED/GREEN)

- `f89ae78` test: RED reproducer (compile-time, module missing)
- `39db221` feat: fact builder → GREEN 18/18
- `0583230` feat: edge function + hook + SSE parser + card + wiring → GREEN 187/187
