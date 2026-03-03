# WebNegosyo Admin App Redesign

## Goal

Fix all critical bugs causing perpetual loading states, redesign the app with an Apple-inspired light theme, and create a clean, minimalist admin experience for restaurant owners and superadmins.

## Audience

Role-based: tenant admins manage their own store's orders/analytics, superadmins see everything.

## Bug Fixes (Critical Path)

### Auth Flow
- Replace silent fallthrough in `_layout.tsx` AuthGate — if `convex_deployment_url` is null, show a "Convex not configured" screen instead of bouncing to login
- Add explicit error handling for failed Supabase queries

### Loading States
- Change `if (!data)` to `if (data === undefined)` on all screens — distinguishes Convex "loading" from "empty result"
- Add timeout + retry UI after 10s

### Convex Provider
- Guard navigation: only route to dashboard when both `isAuthenticated` and `convexUrl` are truthy
- Render loading placeholder when `ConvexAuthProvider` has no client

### Error Handling
- Wrap each tab in error boundary
- Show "Something went wrong. Tap to retry" on Convex failures

## Apple-Inspired Light Theme

| Token | Value | Usage |
|---|---|---|
| background | #F2F2F7 | Screen backgrounds |
| card | #FFFFFF | Card surfaces |
| primary | #007AFF | Buttons, active tab |
| textPrimary | #000000 | Headings |
| textSecondary | #8E8E93 | Subtitles, labels |
| textTertiary | #C7C7CC | Placeholders |
| separator | #E5E5EA | Dividers |
| success | #34C759 | Confirmed, delivered |
| warning | #FF9500 | Preparing, pending |
| danger | #FF3B30 | Cancelled, errors |

Typography: System font, three sizes (title 22 bold, body 17 regular, caption 13 regular).
Cards: White, 12px radius, subtle shadow. No borders.
Tab bar: White with top border, blue active icon, gray inactive.

## Screen Designs

- **Dashboard**: Greeting header + logout, 2x2 stat cards, order queue by status
- **Orders**: Filter pills, order cards with status badges, pull-to-refresh
- **Analytics**: Period selector, upsell funnel, bundle stats, top items
- **Trends**: Period selector, bar chart (restyled), summary stats
- **Order Detail**: Status stepper, items list, action buttons

## Shared Components

`Card`, `Badge`, `StatCard`, `LoadingState`, `ErrorState`, `EmptyState`

## Architecture Decisions

- Keep Zustand auth store, Convex as data layer
- Add `theme/colors.ts` constants (no provider needed)
- Keep string-cast Convex function references
- No new dependencies
