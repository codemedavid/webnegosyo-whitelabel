# Order status and loyalty card look: rules for this folder

<!-- Moved verbatim from the root CLAUDE.md on 2026-11-11. The root file's rules for every change
     (Platform Supabase First, verification, conventions) still apply here. -->

## Order status + Loyalty card look (Branding Studio)

Two Studio screens (journey: … Checkout › Order status › Loyalty card) style the order-tracking page and the loyalty stamp card (tracking page, checkout panel, `/[tenant]/loyalty`). Plan: `docs/plans/2026-10-19-studio-tracking-loyalty.md`.

- **Stored** in `tenants.tracking_style` (jsonb, `20261019120000`, applied): flat key → hex colour / choice / boolean (`src/lib/tracking-style/keys.ts`, strict zod on save, re-validated on read). Studio edits it as virtual fields `tracking_style.<key>` (`studio-columns.ts`); one look on every device. Wording = `storefront_labels` screens `tracking` / `loyalty` (status steps carry `titleLabel`/`headlineLabel`/`descriptionLabel`).
- **One resolver**: `resolveTrackingPalette` (`tracking-style/palette.ts`) → `buildTrackingTheme(branding, style)` publishes every `--trk-*` var. Blank = exactly the pre-2026-10-19 brand-derived look (pinned by `tracking-theme.test.ts`); loyalty colours follow the page accent until set; text gets the readable floor only where the owner changed a side (Studio shows the same issues via `listTenantContrastIssues`). Non-colour choices (timeline, card position, confetti, stamp tick) travel in `TrackingOptionsProvider`.
- **Contract** (`tracking-theme-contract.test.ts`): every `var(--trk-*)` read must be defined; no hard-coded colours in the tracking/loyalty components (QR plate stays white); every React-read choice is read. A new part = palette entry + var + Studio field + scope.
- **Preview**: `/[tenant]/order/studio-preview?brandingPreview=1` renders the shared `TrackingDashboard` with a SAMPLE order (`branding-studio/tracking-preview.ts`; 404 without the param, nothing read from orders); the Show bar streams `__trackingPreview`, and `focusTrackingPreview` switches the sample so the setting being edited is on screen.
