# Custom Hero/Header Attacher — Config & Upload Schema Design (Phase 2, agent 9)

**Status:** DESIGN ONLY. No implementation code, no migrations executed. This doc specifies how a SUPERADMIN attaches, stores, validates, persists, and loads the custom header/hero HTML, building on `01-architecture.md`.

**Scope of this doc (agent 9 — Config & Upload Schema Designer):** the DB schema + migration, the type changes (`Tenant` interface + `supabase.ts` blocks), the LOAD path (select allowlist + prop threading), the SAVE path (where persistence lives + role gate + revalidation), the superadmin form UI (upload + editable code + preview), the Zod schema additions (with the cart-mount marker check), and shippable starter example `.html` templates.

**Decisions locked by the parent task (designed to, not revisited):** D1 (no tenant scripts; LOOK-only; cart is platform-owned via portal), D2 (SUPERADMIN-only; controls live in the superadmin tenant form), D3 (two independent fields + toggles; independent fallback), D4 (upload `.html` → FileReader → editable code field → saved as TEXT; no new upload infra).

---

## 0. Verified facts grounding this design (re-read now)

| Fact | Evidence |
|---|---|
| `tenantSchema` is the single Zod schema for the superadmin form | `src/lib/tenants-service.ts:30-110` |
| Two persistence functions exist (`createTenantSupabase`/`updateTenantSupabase`) AND duplicate inline payloads in the actions | service `:168`, `:264`; actions `src/actions/tenants.ts:73` (create payload), `:217` (update payload) |
| The **actions** are the real entry points (form calls `createTenantAction`/`updateTenantAction`), NOT the service functions | `tenant-form-wrapper.tsx:1374,1383` call `@/actions/tenants`; the service `createTenantSupabase`/`updateTenantSupabase` are a parallel/legacy path with their own payloads |
| Superadmin role gate already exists | `verifySuperadmin()` in `src/actions/tenants.ts:19-40` (checks `app_users.role === 'superadmin'`), called at create `:45` and update `:200` |
| Both actions build an explicit `insertPayload`/`updatePayload` allowlist — a new column MUST be added to **both** or it silently won't persist | `tenants.ts:73-150`, `:217-294` |
| `menu-server.tsx` select is an explicit allowlist; unlisted column → `undefined` on menu page | `src/app/[tenant]/menu/menu-server.tsx:9-34` |
| `page.tsx` passes whole `tenant` to `MenuClient` (no per-field threading) | confirmed by architecture doc §4.4 |
| `supabase.ts` tenants blocks: Row `~:1279`, Insert `~:1400`, Update `~:1521` (hero_design lives there) | `grep` hit lines 1279/1280, 1400/1401, 1521/1522 |
| Migration pattern | `supabase/migrations/20260412000001_qr_handoff_enabled.sql`: `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ... boolean NOT NULL DEFAULT false;` + `COMMENT ON COLUMN`. The original `hero_design` DDL is **not** in the migrations folder — verify live schema first. |
| `revalidatePath('/<slug>/menu','layout')` is the menu revalidation idiom | `saveHeroDesignAction` `src/app/actions/hero-designer.ts:63` |
| `invalidateTenantCache(tenantSlug, tenantId)` exists | `src/lib/cache.ts:208` |
| `generateBrandingCSS` emits 42 `--brand-*` vars (full list cited in §7) | `src/lib/branding-utils.ts:216-261` |
| There is no HTML sanitizer installed | Phase-1 fact; the sanitizer module `sanitizeChromeHtml` is owned by the security agent (see `01-architecture.md` §10.1) |

> **Conflict flagged vs. the task brief & 01-architecture.** The task brief and `01-architecture.md` §4.5/§9 reference `createTenantSupabase`/`updateTenantSupabase` (`tenants-service.ts:168/264`) as the save path. **In reality the superadmin form does NOT call those** — it calls `createTenantAction`/`updateTenantAction` in `src/actions/tenants.ts`, which build their **own** `insertPayload`/`updatePayload` (these are the live writers). The service functions are a separate code path with duplicated payloads. **This doc designs against the live path (`src/actions/tenants.ts`)** and notes the service duplication so the implementer keeps both in sync (or, preferably, routes through a dedicated action — see §4 recommendation). This is the single most important correction to carry forward.

---

## 1. DB schema + migration

### 1.1 Columns (exactly four, mirroring `hero_design` + `hero_section_enabled`)

| Column | Type | Nullable | Default | Purpose |
|---|---|---|---|---|
| `custom_header_html` | `text` | yes | `NULL` | Sanitizable header HTML string (LOOK only) |
| `custom_header_enabled` | `boolean` | NO | `false` | Header render gate |
| `custom_hero_html` | `text` | yes | `NULL` | Sanitizable hero HTML string (LOOK only) |
| `custom_hero_enabled` | `boolean` | NO | `false` | Hero render gate |

Rationale for the type split: the two booleans are `NOT NULL DEFAULT false` (same shape as `qr_handoff_enabled` and `hero_section_enabled`, so every existing row is immediately "feature off" with no backfill). The two HTML columns are nullable `text` (same shape as `hero_design` being nullable) so "never attached" is distinguishable from "attached but empty", and the render gate already treats `NULL`/empty identically (architecture §1a/§1b gate: `typeof === 'string' && trim().length > 0`).

### 1.2 Pre-flight (REQUIRED before writing the migration)

The `hero_design` DDL is not in the migrations folder, so the live `tenants` schema is the source of truth. Before authoring the file, the persistence/implementer agent MUST verify the four columns do not already exist:

```text
mcp__supabase__list_tables  (schema: public, table: tenants)
```

The `ADD COLUMN IF NOT EXISTS` guards make re-runs safe even if a column already exists, but the pre-flight confirms naming doesn't collide and reveals the live column ordering.

### 1.3 Migration file — exact SQL

**Path:** `supabase/migrations/<14-digit UTC timestamp>_custom_header_hero_html.sql`
(e.g. `supabase/migrations/20260529230000_custom_header_hero_html.sql` — pick the real authoring timestamp; must be lexically AFTER `20260412000001_qr_handoff_enabled.sql`.)

```sql
-- Custom hero/header attacher: superadmin-attached HTML that defines the LOOK
-- of the menu page header and hero, per-tenant. LOOK-ONLY: all interactivity
-- (the cart) is platform-owned via a React portal; tenant scripts are stripped
-- at render. Two independent fields + toggles so a broken header/hero cannot
-- affect the other, and both fall back to the default chrome.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS custom_header_html   text,
  ADD COLUMN IF NOT EXISTS custom_header_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_hero_html     text,
  ADD COLUMN IF NOT EXISTS custom_hero_enabled   boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tenants.custom_header_html IS
  'Superadmin-attached HTML defining the menu header LOOK. Sanitized at render (scripts/on*/javascript:/data: stripped). MUST contain exactly one element with data-wn-cart-mount; the platform portals the live cart trigger into it. NULL = use default header.';
COMMENT ON COLUMN tenants.custom_header_enabled IS
  'Render gate for custom_header_html. When false (default), the default header renders. A broken/empty custom_header_html also falls back to the default header.';
COMMENT ON COLUMN tenants.custom_hero_html IS
  'Superadmin-attached HTML defining the menu hero LOOK. Sanitized at render. No cart marker required (hero has no interactivity). NULL = use default hero (hero_design / legacy / text hero).';
COMMENT ON COLUMN tenants.custom_hero_enabled IS
  'Render gate for custom_hero_html. When false (default), the existing hero selection (hero_design v4 / legacy / text / none) renders. Broken/empty custom_hero_html also falls back.';
```

> **No CHECK constraint for the cart-mount marker.** The marker requirement is enforced in the Zod save layer (§6) where we can give a friendly error and (per architecture §3.6) the render layer also falls back if it's missing. A DB CHECK on free-form HTML would be brittle (regex in SQL) and would block legitimate DB-level edits; we keep the DB permissive and the app strict. No length CHECK either — the 100 KB cap is a Zod concern (§6), again to surface a friendly message rather than a Postgres error.

### 1.4 RLS

No RLS change. The four columns live on `tenants`; writes go through the service-role/superadmin-gated action path (§4) exactly like every other tenant column. The public menu read (`menu-server.tsx`) already reads `tenants` under the existing SELECT policy; adding columns to the `.select()` does not change row visibility.

---

## 2. Type changes

### 2.1 `Tenant` interface — `src/types/database.ts` (~:106-143)

Add a grouped block (place near `hero_section_enabled` at `:119` to keep hero/header config together):

```ts
  // Custom hero/header attacher (superadmin-attached HTML; LOOK-only)
  custom_header_html?: string | null;
  custom_header_enabled?: boolean;
  custom_hero_html?: string | null;
  custom_hero_enabled?: boolean;
```

The `[key: string]: unknown` index signature at `database.ts:143` means the menu would *compile* without these, but we add explicit fields for autocomplete + so the render gates in `menu-client.tsx` type-check `=== true` / `typeof === 'string'` cleanly. Optional (`?`) because legacy rows / partial selects may omit them; nullable string because the column is nullable.

### 2.2 `supabase.ts` tenants blocks — `src/types/supabase.ts`

Three sibling blocks must each gain the four fields, mirroring how `hero_design` / `hero_section_enabled` appear at all three sites:

- **Row** (`~:1279`, after `hero_section_enabled: boolean`):
  ```ts
          custom_header_html: string | null
          custom_header_enabled: boolean
          custom_hero_html: string | null
          custom_hero_enabled: boolean
  ```
- **Insert** (`~:1400`, after `hero_section_enabled?: boolean`):
  ```ts
          custom_header_html?: string | null
          custom_header_enabled?: boolean
          custom_hero_html?: string | null
          custom_hero_enabled?: boolean
  ```
- **Update** (`~:1521`, after `hero_section_enabled?: boolean`):
  ```ts
          custom_header_html?: string | null
          custom_header_enabled?: boolean
          custom_hero_html?: string | null
          custom_hero_enabled?: boolean
  ```

Row makes the booleans non-optional `boolean` (NOT NULL with default → always present on a Row); Insert/Update make everything optional (defaults supply the booleans, HTML defaults to NULL).

### 2.3 Regenerate vs. hand-edit — **recommendation: regenerate, then verify**

`src/types/supabase.ts` is a generated artifact. **Recommended:** after applying the migration to the dev/branch DB, regenerate via `mcp__supabase__generate_typescript_types` and replace the file (this guarantees the three blocks + any related views stay consistent and avoids the classic "edited Row but forgot Update" bug). **Fallback (if regeneration is not available in the implementer's environment):** hand-edit all three blocks exactly as in §2.2 — and run `npm run build` (which type-checks the insert/update payloads in `tenants.ts`) to catch a missed block. The `Tenant` interface in `database.ts` (§2.1) is hand-maintained either way; it is NOT generated.

---

## 3. LOAD path

### 3.1 Add the four columns to the menu select allowlist

`src/app/[tenant]/menu/menu-server.tsx`, the `.select(...)` at `:9-34`. Add a line (group with the existing hero line `:23` for readability):

```text
      hero_title, hero_description, hero_title_color, hero_description_color, hero_design, hero_section_enabled,
      custom_header_html, custom_header_enabled, custom_hero_html, custom_hero_enabled,
```

Without this, the columns are `undefined` on the menu page (architecture §4.2 / Phase-1 fact) and every gate evaluates false → feature silently never renders. This is the single most likely "it doesn't work" bug; it is the load-bearing one-line change.

The values flow: select → `tenantData` → `tenant = tenantData as unknown as Tenant` (`menu-server.tsx:43`) → `getMenuData` return → `page.tsx` → `<MenuClient tenant={tenant} .../>`.

### 3.2 `page.tsx` → `MenuClientProps` — **no change required**

`page.tsx` already passes the whole `tenant` object; the new fields ride along. `MenuClientProps` (`menu-client.tsx:23-31`) keeps `tenant: Tenant | null` unchanged. **No new props are threaded into `MenuClient` from `page.tsx`.** (The render-side prop additions — `brandingStyle`, gates, `cartTrigger`, `defaultHeaderProps` — are all *derived inside* `MenuClient` and are owned by the architecture/render agents, not this config doc.)

**Exact prop-addition list for this doc's scope (config/load):**
- `menu-server.tsx` select: `+custom_header_html, +custom_header_enabled, +custom_hero_html, +custom_hero_enabled` (4 columns).
- `MenuClientProps`: **none** (tenant carries them).
- `page.tsx`: **none**.

---

## 4. SAVE path

### 4.1 Decision: (a) extend the existing tenant create/update vs. (b) a dedicated action

**Recommendation: a hybrid — extend the existing form's `createTenantAction`/`updateTenantAction` for the toggles + HTML (so attach-on-create works and there is one save button), but factor the HTML-specific validation + sanitize into a small shared helper, and ALSO ship a dedicated lightweight action for the future tenant-admin phase.** Concretely, for THIS phase:

- **Primary (do this):** extend `tenantSchema` (§6) + the two action payloads in `src/actions/tenants.ts` (create `:73-150`, update `:217-294`) with the four fields, running sanitize-on-write inside a shared helper. This is consistent with how every other tenant setting is saved, keeps the single "Update Tenant" button (D2 — controls live in the superadmin tenant form), and requires no new wiring.
- **Why not a brand-new standalone action as the only path:** the form already round-trips the entire tenant via one submit; splitting HTML into a separate action would mean two saves, two success toasts, and a risk of partial state. The HTML is just four more tenant columns — it belongs in the same transaction.

**Mandatory companion fix (see §0 conflict):** the live writers are the **actions** (`tenants.ts`), and there is a **duplicate** payload in `tenants-service.ts` (`createTenantSupabase:177`/`updateTenantSupabase:288`). To avoid drift, add the four fields to **all four payload sites**:
1. `src/actions/tenants.ts` `insertPayload` (`:73-150`)
2. `src/actions/tenants.ts` `updatePayload` (`:217-294`)
3. `src/lib/tenants-service.ts` `createTenantSupabase` payload (`:177-252`)
4. `src/lib/tenants-service.ts` `updateTenantSupabase` payload (`:288-363`)

> If the implementer prefers to reduce this 4-site duplication, the cleaner refactor is a single `buildTenantWritePayload(parsed)` helper used by all four — but that is a larger change; the minimal-change path is to add the four fields to each payload (they're trivial `parsed.x ?? undefined` lines).

### 4.2 Sanitize-on-write (defense in depth)

Architecture §8 sanitizes on **every render**. We ADDITIONALLY sanitize on **write** so the stored value is already clean (smaller attack surface if the row is read by another path, and the editable field round-trips the cleaned HTML). Both are required; neither alone is sufficient (render-sanitize covers DB-direct edits; write-sanitize keeps storage clean and lets the preview match production).

Implementation note: the write path calls the same `sanitizeChromeHtml(html)` (security agent's module, `01-architecture.md` §10.1). Order of operations in the action:

```text
verifySuperadmin()                       // already present, tenants.ts:45 / :200
parsed = tenantSchema.parse(input)       // Zod metadata validation (length cap, marker check) — §6
sanitizedHeader = parsed.custom_header_html
  ? sanitizeChromeHtml(parsed.custom_header_html)
  : null
sanitizedHero = parsed.custom_hero_html
  ? sanitizeChromeHtml(parsed.custom_hero_html)
  : null
// re-check marker AFTER sanitize for header (sanitizer must preserve data-wn-cart-mount;
// if header enabled and marker is gone post-sanitize -> reject with friendly error)
payload.custom_header_html   = sanitizedHeader
payload.custom_header_enabled = parsed.custom_header_enabled ?? false
payload.custom_hero_html     = sanitizedHero
payload.custom_hero_enabled   = parsed.custom_hero_enabled ?? false
```

The post-sanitize marker re-check is the belt-and-suspenders guard: Zod validates the raw input has the marker (§6); after sanitize we confirm the sanitizer kept it (the sanitizer contract whitelists `data-wn-*`, so it should — but if the marker was inside a stripped element, this catches it).

> **Store sanitized or raw?** Architecture §10.2 recommends *store-raw* so the superadmin sees what they typed. We **diverge slightly: store the SANITIZED string** here, because (1) the editable field then shows exactly what will render (no surprises), (2) it shrinks stored attack surface, and (3) render still re-sanitizes so even a raw DB edit is safe. The cost — the superadmin's stripped `<script>` won't reappear in the editor — is acceptable and arguably desirable (it teaches them scripts are not allowed). Whichever the persistence agent picks, render-time sanitize is non-negotiable.

### 4.3 Role gate

Already satisfied: `createTenantAction`/`updateTenantAction` call `verifySuperadmin()` (`tenants.ts:45`, `:200`) which enforces `app_users.role === 'superadmin'`. No new gate needed because we are extending these existing superadmin-only actions (D2). **Do NOT** expose these four fields through `updateTenantBrandingForAdminAction` (`tenants.ts:352`, gated only by `verifyTenantAdmin`) — that would let a tenant admin attach HTML, violating D2. The `brandingUpdateSchema` (`tenants.ts:319-348`) must NOT gain these fields.

### 4.4 Revalidation

The existing actions revalidate only superadmin paths (`tenants.ts:170-171`, `:310-312`). For the menu to reflect the new chrome, the action MUST additionally revalidate the public menu and bust the tenant cache. Add to BOTH `createTenantAction` (after insert) and `updateTenantAction` (after update):

```ts
import { invalidateTenantCache } from '@/lib/cache'
// ...after successful write, with the saved row's slug + id:
revalidatePath(`/${tenant.slug}/menu`, 'layout')   // matches hero-designer.ts:63 idiom
await invalidateTenantCache(tenant.slug, tenant.id) // cache.ts:208 (React cache + Redis)
```

For `updateTenantAction`, the saved row is `data` (`tenants.ts:303`) — use `data.slug`/`data.id`. For `createTenantAction`, it already has `tenant` (`:174`) before the `redirect` (`:183`); insert the revalidate+invalidate **before** the redirect throws.

> Note: this also makes hero/branding edits show up faster on the menu (a latent pre-existing gap — the create/update actions never busted the menu cache), a small correctness win.

### 4.5 Why not write to `tenants-service.ts` only

Per §0, the form does not call the service functions, so persisting there alone would not work. We keep the service in sync only to prevent drift for any other caller; the *behavioral* save is via the actions.

---

## 5. Admin UI (superadmin form)

### 5.1 Placement

Add **one new section component** `CustomChromeSection` to `src/components/superadmin/tenant-form-wrapper.tsx`, rendered in the `<form>` (`:1404-1515`) immediately **after** `MenuEngineeringSection` and before `FlashScreenFeatureSection` (it is a look/branding-adjacent feature; grouping it with the visual sections is most discoverable). It follows the exact `Card` / `CardHeader` / `CardTitle` / `Switch` idiom every other section uses (e.g. `MenuEngineeringSection` `:632-699`).

### 5.2 Form-state additions

Extend `TenantFormData` (`:30-91`) and the `useState` initializer (`:1240-1302`) and the `handleSubmit` `input` object (`:1307-1369`):

```ts
// TenantFormData (add):
  custom_header_enabled: boolean
  custom_header_html: string
  custom_hero_enabled: boolean
  custom_hero_html: string
```
```ts
// useState initializer (add):
  custom_header_enabled: tenant?.custom_header_enabled ?? false,
  custom_header_html: tenant?.custom_header_html || '',
  custom_hero_enabled: tenant?.custom_hero_enabled ?? false,
  custom_hero_html: tenant?.custom_hero_html || '',
```
```ts
// handleSubmit input (add):
  custom_header_enabled: formData.custom_header_enabled,
  custom_header_html: formData.custom_header_html || undefined,
  custom_hero_enabled: formData.custom_hero_enabled,
  custom_hero_html: formData.custom_hero_html || undefined,
```

Form-state uses `string` (textarea value); the action/Zod converts `''` → `undefined`/`null`. Booleans default `false` to mirror DB defaults.

### 5.3 The section component — structure

`CustomChromeSection` renders TWO parallel sub-blocks (header, hero), each:
1. A **`<Switch>`** (`custom_header_enabled` / `custom_hero_enabled`) with the platform `Switch` component (already imported `:10`).
2. A **file `<input>`** `accept=".html,text/html"` that, on change, reads the file via `FileReader.readAsText` and sets the textarea value (D4 — NO server upload; the file never leaves the browser):
   ```tsx
   const handleUpload = (file: File, set: (v: string) => void) => {
     const reader = new FileReader()
     reader.onload = () => set(typeof reader.result === 'string' ? reader.result : '')
     reader.readAsText(file)
   }
   // <input type="file" accept=".html,text/html"
   //   onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, (v) => setFormData({ ...formData, custom_header_html: v })) }} />
   ```
3. An **editable `<textarea>`** (the same value the upload populates — stays editable after upload, D4). Use a monospace, `min-h-[240px]`, `font-mono text-xs` textarea (plain `<textarea>` styled with the form's input classes; no new code-editor dependency — keep it minimal). The textarea is the source of truth; upload merely seeds it.
4. A **live-ish preview** (see §5.5).
5. **Inline validation messaging** (see §5.4).

The two sub-blocks are independent; disabling the header switch leaves the hero block fully usable and vice versa (D3). The textareas remain editable even when the corresponding switch is off (so a superadmin can prepare HTML before enabling).

### 5.4 Validation messaging (client-side, advisory)

The authoritative validation is server-side Zod (§6); the form adds friendly **advisory** hints so the superadmin fixes issues before submit:

- **Missing cart marker (header only):** when `custom_header_html` is non-empty and does NOT contain `data-wn-cart-mount`, show an amber warning box (same style as `:665-669`):
  > **Cart mount missing.** Your header HTML must include exactly one element with `data-wn-cart-mount` (e.g. `<div data-wn-cart-mount></div>`) so the shopping cart button can be placed inside it. Without it, the default header will be used.

  Detect with a cheap `formData.custom_header_html.includes('data-wn-cart-mount')` for the hint (the server does the rigorous "exactly one" check).
- **Too long:** when length > 100 000 chars, red text: "Header HTML is too large (max ~100 KB)."
- **Enabled-but-empty:** when the switch is on but the textarea is empty, blue note: "Enabled but no HTML attached — the default header will render."
- **Scripts present (informational):** if the HTML contains `<script`, an amber note: "Scripts are not allowed and will be removed automatically. This feature is look-only; the cart is provided by the platform." (Matches D1; the server/render strips them regardless.)

These are non-blocking hints (the server is the gate); they exist for UX so the superadmin isn't surprised by a silent fallback.

### 5.5 Preview

Per architecture §10.3, the preview can reuse `<CustomHeader>`/`<CustomHero>` with a fake `cartTrigger` for fidelity. For THIS form, a **lightweight sandboxed preview** is recommended to avoid pulling the cart context into the superadmin form:

- Render the sanitized HTML into a preview container. **Recommended:** a same-origin `<iframe sandbox>` (`sandbox=""` — no `allow-scripts`, so even if sanitization missed something, nothing executes) whose `srcDoc` is `sanitizeChromeHtml(value)` wrapped with the `--brand-*` vars injected as a `<style>` block on a wrapper `<div>` (so the preview shows brand colors). The iframe sandbox gives a hard second boundary in the admin context, where the superadmin is editing untrusted-ish HTML.
- For the header preview, drop a static placeholder pill where `data-wn-cart-mount` is (a non-functional 🛒 swatch) so the superadmin sees where the cart will sit. The real, functional cart only exists on the live menu via the portal (architecture §3).
- Debounce the preview update (~300 ms) off the textarea to keep typing smooth.

The sanitizer running in the browser for the preview is acceptable (the security agent's module should be isomorphic, or the preview calls a tiny server action that returns sanitized HTML; the architecture's sanitizer contract is a pure `string -> string` so it can run either side). If the sanitizer is server-only, the preview uses a small `previewSanitizeAction` instead.

### 5.6 Consistency

Reuse `Card`/`CardHeader`/`CardTitle`/`Label`/`Switch`/`Separator` (all already imported in the wrapper). No new dependencies, no new design system. The section visually matches `MenuEngineeringSection`/`FlashScreenFeatureSection`.

---

## 6. Zod schema additions

### 6.1 Where

Two viable homes; **recommendation: a small dedicated module `src/lib/custom-chrome-schemas.ts`** for the field schemas + the marker check (mirrors `hero-block-schemas.ts` living separately from `tenants-service.ts`), then **compose those into `tenantSchema`** (`tenants-service.ts:30`). Keeping the marker/length logic in its own file makes it unit-testable in isolation (`tests/unit/lib/custom-chrome-schemas.test.ts`, mirroring `hero-block-schemas.test.ts`) without constructing a full tenant.

### 6.2 Field schemas (mirror `hero-block-schemas.ts` guards)

```ts
// src/lib/custom-chrome-schemas.ts
import { z } from 'zod'

const MAX_CHROME_HTML = 100_000 // ~100 KB

/** Counts non-overlapping occurrences of the cart mount marker. */
export function countCartMountMarkers(html: string): number {
  // attribute may appear as data-wn-cart-mount with or without a value
  return (html.match(/data-wn-cart-mount\b/gi) ?? []).length
}

/** Raw HTML string field: bounded length, no hard char rejection (HTML needs < >). */
const chromeHtmlField = z
  .string()
  .max(MAX_CHROME_HTML, { message: 'HTML is too large (max ~100 KB).' })
  .optional()
  .or(z.literal(''))
  .optional()

export const customChromeSchema = z
  .object({
    custom_header_enabled: z.boolean().default(false),
    custom_header_html: chromeHtmlField,
    custom_hero_enabled: z.boolean().default(false),
    custom_hero_html: chromeHtmlField,
  })
  .superRefine((val, ctx) => {
    // Header marker rule: if enabled with non-empty HTML, require EXACTLY one marker.
    const headerHtml = (val.custom_header_html ?? '').trim()
    if (val.custom_header_enabled && headerHtml.length > 0) {
      const n = countCartMountMarkers(headerHtml)
      if (n !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['custom_header_html'],
          message:
            n === 0
              ? 'Header HTML must contain exactly one element with data-wn-cart-mount so the cart button can be placed.'
              : `Header HTML must contain exactly one data-wn-cart-mount marker (found ${n}).`,
        })
      }
    }
    // Hero has NO marker requirement (no interactivity).
  })
```

Notes:
- **No `[<>]` rejection** (unlike `safeString` in `hero-block-schemas.ts:20-24`) — HTML legitimately needs angle brackets. The *content* safety is the sanitizer's job (§4.2 + render-time). Zod here only validates **metadata**: length cap and the cart-marker invariant. This is the deliberate boundary: Zod = shape/policy, sanitizer = content.
- **Marker rule keyed on `enabled`:** we only require the marker when the header is enabled with HTML, so a superadmin can save half-written HTML with the switch OFF (draft) without a hard error. The render gate also short-circuits when disabled (architecture §1a).
- **"exactly one":** more than one marker would make the portal mount ambiguous (architecture §3.2 uses a single `querySelector`); we reject `>1` early.

### 6.3 Composing into `tenantSchema`

In `tenants-service.ts`, extend the existing object (add inside `z.object({...})` at `:30-110`):

```ts
  // Custom hero/header attacher (superadmin-only)
  custom_header_enabled: z.boolean().default(false),
  custom_header_html: z.string().max(100_000).optional().or(z.literal('')).optional(),
  custom_hero_enabled: z.boolean().default(false),
  custom_hero_html: z.string().max(100_000).optional().or(z.literal('')).optional(),
```

Then apply the marker `superRefine` to the whole `tenantSchema` (Zod allows `tenantSchema.superRefine(...)`), OR — cleaner — import `customChromeSchema`'s refinement logic and `.superRefine` `tenantSchema` with the same `countCartMountMarkers` check. Recommended concrete shape:

```ts
export const tenantSchema = baseTenantObject.superRefine((val, ctx) => {
  const headerHtml = (val.custom_header_html ?? '').trim()
  if (val.custom_header_enabled && headerHtml.length > 0 && countCartMountMarkers(headerHtml) !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['custom_header_html'],
      message: 'Header HTML must contain exactly one data-wn-cart-mount marker.' })
  }
})
```

(where `baseTenantObject` is the current `z.object({...})`). This keeps `TenantInput = z.infer<typeof tenantSchema>` working and surfaces the marker error in the form's existing `toast.error(result.error)` path (`tenant-form-wrapper.tsx:1376/1384`, which prints `Validation error: ...` from `tenants.ts:53`).

> `.superRefine` does not change the inferred type, so `TenantInput`, the actions, and the form's `input` object are unaffected besides the four new keys.

### 6.4 Test coverage (hand to test agent)

`tests/unit/lib/custom-chrome-schemas.test.ts` (template: `tests/unit/hero-block-schemas.test.ts`), cases:
- header enabled + valid single marker → passes
- header enabled + zero markers → fails with the marker message
- header enabled + two markers → fails ("found 2")
- header **disabled** + zero markers → passes (draft allowed)
- hero enabled + zero markers → passes (no marker rule for hero)
- HTML > 100 KB → fails on length
- empty strings / undefined → pass (treated as "not attached")

---

## 7. Starter example `.html` templates (ship as docs)

Ship two files so a superadmin has a working template. **Path:** `docs/custom-header-hero/examples/` (docs only; never imported, never executed by the app). These demonstrate (a) the `data-wn-cart-mount` slot in the header, (b) `--brand-*` usage, (c) LOOK-only markup (no scripts).

**Available `--brand-*` variables** (from `generateBrandingCSS`, `branding-utils.ts:216-261`), usable inside both templates: `--brand-background`, `--brand-header`, `--brand-header-font`, `--brand-cards`, `--brand-cards-border`, `--brand-card-title`, `--brand-card-price`, `--brand-card-description`, `--brand-modal-*`, `--brand-checkout-modal-*`, `--brand-button-primary`, `--brand-button-primary-text`, `--brand-button-secondary`, `--brand-button-secondary-text`, `--brand-text-primary`, `--brand-text-secondary`, `--brand-text-muted`, `--brand-menu-main-header-text`, `--brand-menu-main-header-subtitle`, `--brand-menu-category-header`, `--brand-menu-category-active`, `--brand-menu-category-inactive`, `--brand-menu-cart-badge-bg`, `--brand-menu-cart-badge-text`, `--brand-border`, `--brand-success`, `--brand-warning`, `--brand-error`, `--brand-link`, `--brand-shadow`, `--brand-primary`, `--brand-secondary`, `--brand-accent`.

### 7.1 `examples/custom-header.example.html`

```html
<!--
  Custom Header example — LOOK ONLY.
  REQUIRED: exactly one element with data-wn-cart-mount. The platform portals
  the live, fully-functional cart button (open drawer + live item badge) INTO it.
  Do NOT add your own cart button, <script>, on* handlers, or javascript:/data: URLs
  — they are stripped. Use the --brand-* CSS variables for tenant colors.
-->
<div style="
  display:flex; align-items:center; justify-content:space-between;
  gap:16px; padding:12px 20px;
  background:var(--brand-header, #ffffff);
  color:var(--brand-header-font, #111111);
  border-bottom:1px solid var(--brand-border, #e5e7eb);
  font-family: ui-sans-serif, system-ui, sans-serif;
">
  <!-- Left: brand cluster (static look; swap the text/logo as you like) -->
  <div style="display:flex; align-items:center; gap:12px;">
    <span style="
      display:inline-flex; align-items:center; justify-content:center;
      width:40px; height:40px; border-radius:9999px;
      background:var(--brand-primary, #c41e3a);
      color:var(--brand-button-primary-text, #ffffff);
      font-weight:700; font-size:18px;
    ">★</span>
    <span style="font-size:20px; font-weight:800; letter-spacing:-0.01em;">
      Your Restaurant
    </span>
  </div>

  <!-- Right: the cart goes HERE. Leave this element EMPTY. The platform
       injects the working cart trigger + live badge into it. -->
  <div data-wn-cart-mount aria-label="Shopping cart"></div>
</div>
```

### 7.2 `examples/custom-hero.example.html`

```html
<!--
  Custom Hero example — LOOK ONLY. No cart, no scripts, no interactivity.
  Renders above the menu. Use --brand-* variables for tenant colors.
  Raw <img> is allowed (LOOK only); the src is constrained by the sanitizer's URL rules.
-->
<section style="
  position:relative; overflow:hidden;
  padding:56px 24px; text-align:center;
  background:
    linear-gradient(135deg,
      var(--brand-primary, #c41e3a) 0%,
      var(--brand-secondary, #009246) 100%);
  color:var(--brand-button-primary-text, #ffffff);
  font-family: ui-sans-serif, system-ui, sans-serif;
">
  <h1 style="margin:0 0 12px; font-size:40px; font-weight:900; letter-spacing:-0.02em;">
    Fresh. Fast. Yours.
  </h1>
  <p style="margin:0 auto; max-width:520px; font-size:18px; opacity:0.92;">
    Order in seconds — browse the full menu below.
  </p>
  <div style="
    display:inline-block; margin-top:24px; padding:12px 28px;
    border-radius:9999px;
    background:var(--brand-button-primary, #ffffff);
    color:var(--brand-button-primary-text, #111111);
    font-weight:700; font-size:16px;
  ">
    View Menu ↓
  </div>
</section>
```

> Note on the hero "button": it is a static visual pill (LOOK only, D1). It does not need to navigate — the menu is directly below it. If a future phase wants a working hero CTA, that becomes a second platform-owned portal target like the cart (out of scope here).

A short `examples/README.md` should state: upload these in the superadmin tenant form's Custom Header/Hero section, toggle the corresponding switch on, save, and view the tenant menu. Editing the textarea after upload is supported.

---

## 8. End-to-end trace (config/load/save) — one screen

```
SUPERADMIN form (tenant-form-wrapper.tsx CustomChromeSection)
  Switch -> formData.custom_header_enabled / custom_hero_enabled
  file<input> --FileReader.readAsText--> <textarea> (editable) -> formData.custom_*_html
  (advisory hints: marker missing / too long / scripts present)
        |
        v  handleSubmit input{...}
createTenantAction / updateTenantAction (tenants.ts)         [SUPERADMIN-gated: verifySuperadmin]
  tenantSchema.parse  -> length cap + EXACTLY-ONE data-wn-cart-mount (when header enabled)  [§6]
  sanitizeChromeHtml(header), sanitizeChromeHtml(hero)        [§4.2 write-time sanitize]
  re-check marker survived sanitize (header)
  payload += 4 fields  -> supabase update/insert tenants      [§4.1 add to ALL 4 payload sites]
  revalidatePath('/<slug>/menu','layout') + invalidateTenantCache(slug,id)   [§4.4]
        |
        v  (next menu request)
menu-server.tsx .select(... custom_header_html, custom_header_enabled,
                            custom_hero_html, custom_hero_enabled ...)        [§3.1]
  -> tenant object -> page.tsx -> <MenuClient tenant=...>      [§3.2 no extra props]
        |
        v
MenuClient derives gates + brandingStyle + cartTrigger        [architecture §1/§4 — other agent]
  CustomHeader (sanitize-on-render + portal cart into data-wn-cart-mount)
  CustomHero   (sanitize-on-render, no portal)
  fallbacks: DefaultHeader / renderDefaultHero on disabled|empty|broken|marker-missing
```

---

## 9. File-change checklist (this doc's scope)

**Migration (new):**
- `supabase/migrations/<ts>_custom_header_hero_html.sql` — §1.3 (pre-flight `list_tables` first, §1.2).

**Types:**
- `src/types/database.ts` — 4 fields on `Tenant` (~:119) — §2.1.
- `src/types/supabase.ts` — 4 fields × 3 blocks (Row ~:1279, Insert ~:1400, Update ~:1521) — §2.2; **regenerate preferred** — §2.3.

**Load:**
- `src/app/[tenant]/menu/menu-server.tsx` — add 4 columns to `.select` (~:23) — §3.1. (No `page.tsx`/`MenuClientProps` change.)

**Save:**
- `src/lib/custom-chrome-schemas.ts` (new) — field schemas + `countCartMountMarkers` + marker refine — §6.2.
- `src/lib/tenants-service.ts` — extend `tenantSchema` (:30) + add 4 fields to `createTenantSupabase`/`updateTenantSupabase` payloads (:177/:288) — §6.3, §4.1.
- `src/actions/tenants.ts` — add 4 fields to `insertPayload` (:73) + `updatePayload` (:217); sanitize-on-write helper call (§4.2); `revalidatePath('/<slug>/menu','layout')` + `invalidateTenantCache` in both actions (§4.4). **Do NOT** add to `brandingUpdateSchema` (§4.3).

**UI:**
- `src/components/superadmin/tenant-form-wrapper.tsx` — `CustomChromeSection` + `TenantFormData`/initializer/`input` additions + render in `<form>` after `MenuEngineeringSection` — §5.

**Docs/examples (new):**
- `docs/custom-header-hero/examples/custom-header.example.html` — §7.1
- `docs/custom-header-hero/examples/custom-hero.example.html` — §7.2
- `docs/custom-header-hero/examples/README.md` — §7

**Tests (hand to test agent):**
- `tests/unit/lib/custom-chrome-schemas.test.ts` — §6.4.

**Depends on (other agents):**
- `sanitizeChromeHtml(html: string): string` (security agent, `01-architecture.md` §10.1) — used at write (§4.2) and render (architecture §3.1/§8) and preview (§5.5).
- Render components `<CustomHeader>`/`<CustomHero>`/`<CartTriggerButton>`/`<CustomRegionBoundary>` (architecture/render agent, `01-architecture.md` §2).

---

## 10. Conflicts / deltas vs. 01-architecture.md (explicit)

1. **Save path target (important).** `01-architecture.md` §4.5/§9 says the save path is `createTenantSupabase`/`updateTenantSupabase` (`tenants-service.ts:168/264`). The **live** writers are `createTenantAction`/`updateTenantAction` (`src/actions/tenants.ts`), which the form actually calls and which have their own duplicated payloads. **This doc designs against the actions** and additionally keeps the service payloads in sync to avoid drift (§0, §4.1). Implementers must add the four fields to **all four** payload sites.
2. **Store sanitized vs. raw.** Architecture §10.2 recommends store-raw. This doc recommends **store-sanitized** (with render still re-sanitizing) so the editable field and preview match production exactly and stored attack surface is minimal (§4.2). Either is safe because render always sanitizes; flagged so the persistence agent makes one consistent choice.
3. **Revalidation gap.** Architecture §10.4 says the save must `revalidatePath('/<slug>/menu','layout')` + `invalidateTenantCache`. The existing actions revalidate **only** superadmin paths — so this is a NET-NEW addition to both actions, not a tweak (§4.4). Doing it also fixes a latent cache-staleness gap for hero/branding edits.
4. **Marker enforcement location.** Architecture §3.6 makes the missing-marker case fall back at render. This doc ADDS save-time Zod enforcement ("exactly one marker when header enabled") + a post-sanitize re-check (§6, §4.2) so the superadmin gets a friendly error instead of a silent fallback. Render fallback remains as defense in depth. No conflict — complementary layers.

Everything else (the two independent gates, the `--brand-*` exposure scoped to the wrappers, the component decomposition) is consistent with `01-architecture.md` and this doc plugs into those contracts unchanged.
