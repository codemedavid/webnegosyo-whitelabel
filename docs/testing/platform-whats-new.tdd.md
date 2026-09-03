# TDD Evidence: Platform "What's New" + on-command merchant push

**Source plan:** inline `/ecc:plan` output in the session (no `.plan.md` artifact). Journeys were derived during planning and reused here.
**Branch:** `presell-stock` · **Date:** 2026-09-03

## User journeys

1. As the platform operator, I want to write a blog-post-style update (text, images, uploaded video, YouTube/Vimeo link) so merchants can learn about a release inside the app.
2. As a merchant, I want a popup when a new post is published and a screen listing every post, so I can read at my own pace.
3. As the platform operator, I want to push a notification to every merchant device (or chosen stores) on command.

## Task report

| Task | Summary | Command | RED → GREEN |
|---|---|---|---|
| Content-block model (web) | zod schema for heading/paragraph/image/video/embed + composer input; YouTube/Vimeo resolver | `npx jest tests/unit/announcement-blocks.test.ts` | `Cannot find module '../../src/lib/announcements/blocks'` (a2031424) → 16 passed (ee21c609) |
| Announcement push helpers (web) | audience filter + token dedupe, message build with push-copy precedence, DeviceNotRegistered collection | `npx jest tests/unit/announcement-push.test.ts` | `Cannot find module '../../src/lib/push/announcement-push'` (a2031424) → 9 passed (ee21c609) |
| Content-block model (app copy) | hand-rolled twin of the web schema | `npx jest --selectProjects logic lib/announcements` | `TS2307: Cannot find module './blocks'` (5e8ddc51) → PASS (a7bb558a) |
| Popup + tap-routing rules (app) | newest unread `post` with `showPopup`; session gate; push data → route | same | `TS2307: Cannot find module './popup'` (5e8ddc51) → PASS (a7bb558a) |
| Platform device registration (app) | one row per signed-in, non-demo, non-impersonating device, any order backend | `npx jest --selectProjects logic lib/platform-device-token.test.ts` | `TS2307: Cannot find module './platform-device-token'` (5e8ddc51) → PASS (a7bb558a) |
| Schema + RLS | `platform_announcements`, `platform_announcement_reads`, `platform_device_tokens`; applied via Supabase MCP | `apply_migration platform_announcements` → `{"success":true}` | n/a (DDL) |
| Superadmin composer, send action, app screens | list/editor/preview/send button; server actions behind `assertSuperadmin`; inbox + detail + popup host | `npx tsc --noEmit` (web: 0 errors in new files) · `npx eslint <new web files>` (clean) · app `npx tsc --noEmit` (0 errors in new files; 10 pre-existing elsewhere) | n/a (UI, covered by pure-rule tests + typecheck) |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Every block type parses in order; unknown types, non-https media, unsupported embed hosts, empty text and non-arrays are refused | `tests/unit/announcement-blocks.test.ts` | unit | PASS |
| 2 | YouTube watch/youtu.be/shorts and Vimeo links resolve to id, watch url and (YouTube) thumbnail; anything else is null | same | unit | PASS |
| 3 | A post needs ≥1 block, a notice does not; empty or malformed audience lists are refused | same | unit | PASS |
| 4 | Recipients are deduped by token; an audience list excludes other stores and store-less devices; empty list reaches nobody; input is not mutated | `tests/unit/announcement-push.test.ts` | unit | PASS |
| 5 | Push copy: explicit push title/body > post title/summary > generic body; payload carries `announcementId` + `kind` | same | unit | PASS |
| 6 | Only tickets reporting `DeviceNotRegistered` yield stale tokens; misaligned ticket lists yield none | same | unit | PASS |
| 7 | App copy of the block model enforces the same acceptance/refusal rules | `webnegosyo-app/lib/announcements/blocks.test.ts` | unit | PASS |
| 8 | Popup picks the newest unread `post` with `showPopup`; notices and quiet posts never pop; all-read → null | `webnegosyo-app/lib/announcements/popup.test.ts` | unit | PASS |
| 9 | Demo, signed-out, and impersonating-superadmin sessions are never greeted | same | unit | PASS |
| 10 | Tapped push routes: post → detail, notice → inbox, order push/junk → null | same | unit | PASS |
| 11 | Device registers under its store whatever the order backend; superadmin registers store-less; demo/signed-out/impersonating never register | `webnegosyo-app/lib/platform-device-token.test.ts` | unit | PASS |

Totals: web `npx jest tests/unit/announcement` → 3 suites, 30 passed. App logic project → the 3 new suites pass; 28 pre-existing failures in `lib/screen-primitives.test.ts` belong to another session's uncommitted analytics work and are unrelated.

## Coverage and known gaps

- Pure rules are fully unit-tested. The composer UI, server actions, and app screens are verified by typecheck + lint only; the send path (`sendAnnouncementPush`) has no fake-fetch test yet.
- No device has a `platform_device_tokens` row until it runs the new app JS; the Send dialog shows the live count so an empty send is visible before it happens.
- Video (uploaded or embedded) opens outside the app. In-app playback needs `expo-video` and a native build.
- The Account-screen entry row is an uncommitted edit to `webnegosyo-app/app/(main)/account.tsx` because another session had that file mid-rewrite; the inbox is still reachable via push tap and the route.

## Merge evidence

RED commits a2031424, 5e8ddc51 · GREEN commits ee21c609, a7bb558a · feature commits 0f00f961, 0fa7e137. If squashed, keep this table in the PR body.
