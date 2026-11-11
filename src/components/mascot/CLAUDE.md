# Owl mascot: rules for this folder

<!-- Moved verbatim from the root CLAUDE.md on 2026-11-11. The root file's rules for every change
     (Platform Supabase First, verification, conventions) still apply here. -->

## Owl mascot (animated, merchant-facing only)

`<Owl state="idle|happy|thinking|waiting|sorry|celebrating|sleeping" size framing="full|bust" label? />` (`src/components/mascot/`). NEVER on diner storefronts — those are white-labeled as the store's brand.

- **Art is generated**: `node scripts/mascot/build-owl-svg.mjs` writes `public/assistant/owl-mascot.svg` AND `src/components/mascot/owl-art.generated.ts` (never hand-edit either). Source modules in `scripts/mascot/lib/` (left side only, mirrored); traced from `scripts/mascot/reference-sheet.png`. `tests/unit/mascot/` fails if the two outputs drift.
- **Rig**: every moving part is `<g class="o-<part>">` with an inline transform-origin and NO transform attribute (`lib/rig.mjs`); expression variants (happy/closed eyes, lids) and effects (`fx-*`) start at opacity 0.
- **States** live only in `owl.module.css`: a state = face (static poses) + motion (animations); reduced motion keeps the face. New state → add to `OWL_STATES` + CSS (test-enforced).
- Ids are prefixed per instance (`useId`); under 120px the blurred shading is dropped (`toLite`).
- Used in: assistant launcher/header (`owl-mood.ts`: sorry > thinking > happy-after-Confirm > idle), onboarding wizard guide (`guide-owl.ts`), build screen, reveal, Start here, admin error boundary, empty orders/menu/customers.
