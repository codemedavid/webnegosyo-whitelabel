# Hero Builder: rules for this folder

<!-- Moved verbatim from the root CLAUDE.md on 2026-11-11. The root file's rules for every change
     (Platform Supabase First, verification, conventions) still apply here. -->

## Hero Builder (custom storefront hero)

`/[tenant]/admin/hero-designer` (sidebar: "Hero Builder", full-screen like Branding Studio) edits a **v5 flow design**: sections → columns → widgets, each node a desktop `style` + optional `tablet`/`mobile` partial overrides (desktop-first cascade, `resolveStyle`). Nothing is absolutely positioned, so a design cannot overflow a phone.

- **Engine** `src/lib/hero-builder/` (pure, tested in `tests/unit/hero-builder/`): `types`, `schema` (save-time zod), `tree-ops` (immutable edits), `editor-state` (reducer + coalesced undo), `css` (design → ONE scoped sheet using `@container hb` queries — the storefront renders the design once; the editor's 1280/820/390px frames show real layouts because breakpoints are container widths), `load` (parse + v4→v5 on the fly), `templates` / `section-presets`.
- **`tenants.hero_design` is a TEXT column** — the API returns a JSON string. Always read it through `loadHeroDesign` / `hero-mode.ts`; `design.version` on the raw value is always undefined (this silently disabled every custom hero before v5).
- A custom hero renders ONLY when `hero_preset === 'custom'`; `publishHeroDesignAction` validates, stores and sets it. v3 (absolute) designs keep the legacy `HeroRenderer`.
- **Every value is re-validated at render** (`safe-values.ts`) because the sheet is injected into `<style>`; table lookups use own-property checks (`constructor`/`__proto__` keys once crashed the sheet build).
- **Custom code**: "HTML & CSS" = DOMPurify (browser-side, at output) into a shadow root with `contain: layout paint` (styles can't leak, `position:fixed` can't escape the box). "Embed" = `srcdoc` iframe sandboxed WITHOUT `allow-same-origin`/`allow-top-navigation`; only height messages from that frame's own window are honoured.
