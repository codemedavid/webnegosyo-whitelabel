# Leads Dashboard UI Upgrade

**Date:** 2026-04-05
**Scope:** Visual polish and consistency pass on all leads dashboard components. No new features, no backend changes.

## Problem

The leads dashboard (`/superadmin/leads`) uses hardcoded dark-mode zinc colors (`bg-zinc-800`, `text-zinc-100`, etc.) while the rest of the superadmin area uses semantic theme tokens (`bg-card`, `text-muted-foreground`, `border`). The stat cards lack visual hierarchy compared to the dashboard page. The table doesn't feel polished — no avatars, plain text badges, raw "View ->" links.

## Design

### 1. LeadAnalytics — Stat Cards (`lead-analytics.tsx`)

Replace the current plain `CardHeader`/`CardContent` layout with an icon-badged layout matching the superadmin dashboard pattern.

**Structure per card:**
- Top row: label text (left) + icon badge (right)
- Icon badge: 36px rounded square with pastel tinted background and colored icon
- Large number value below (text-3xl font-bold)
- Delta/subtitle line at bottom with trend indicator

**Card assignments:**
| Card | Icon (lucide-react) | Badge BG | Icon Color |
|------|---------------------|----------|------------|
| Total Leads | `Users` | `bg-blue-50` | `text-blue-600` |
| Conversion Rate | `TrendingUp` | `bg-green-50` | `text-green-600` |
| Pending Calls | `Phone` | `bg-amber-50` | `text-amber-600` |
| Avg Response Time | `Clock` | `bg-purple-50` | `text-purple-600` |

Uses shadcn `Card` with default semantic classes throughout — no hardcoded color overrides.

### 2. LeadStatusPipeline — New Component (`lead-status-pipeline.tsx`)

New component rendered between the analytics cards and the table.

**Layout:**
- Wrapped in a shadcn `Card`
- Horizontal segmented bar (8px tall, rounded) showing proportional lead count per status
- Legend row below: colored dot + label + count for each status

**Colors:**
| Status | Bar/Dot Color |
|--------|---------------|
| New | `bg-blue-500` |
| Contacted | `bg-amber-500` |
| Qualified | `bg-purple-500` |
| Converted | `bg-green-500` |
| Lost | `bg-zinc-300` |

**Data:** Requires per-status counts. Add a `statusBreakdown` field to the `LeadStats` interface:
```typescript
statusBreakdown: Record<LeadStatus, number>
```
Computed in `getLeadStats()` alongside existing metrics. This is the only backend-adjacent change — a single additional count query.

### 3. LeadsTable (`leads-table.tsx`)

**Wrapper:** Entire table + toolbar + pagination wrapped in a single shadcn `Card`.

**Toolbar:**
- Filter tabs: active uses `bg-primary text-primary-foreground`, inactive uses `bg-muted text-muted-foreground`
- Add lead counts to each tab label (e.g., "New 12")
- Counts come from the status breakdown data passed as a prop
- Search input and Export CSV button: use default shadcn `Input` and `Button variant="outline"` — no hardcoded zinc classes

**Table header:** `bg-muted/50` background, `text-muted-foreground` for column labels.

**Table rows:**
- Add avatar initials circle before the name (36px, rounded-full, status-colored pastel background with matching text color)
- Name + source stacked (source in `text-muted-foreground text-xs`)
- Contact: email + phone stacked
- Status: use upgraded `LeadStatusBadge` (dot + label pill)
- Submitted: relative time in `text-muted-foreground`
- Action: replace "View ->" text with a `ChevronRight` icon from lucide-react in `text-muted-foreground`

**Pagination:** Subtle `bg-muted/50` background bar at the bottom inside the card. Use default `Button variant="outline"` for prev/next.

**Remove all hardcoded zinc classes** — replace with semantic tokens:
- `bg-zinc-800` → `bg-muted`
- `text-zinc-100` → `text-foreground`
- `text-zinc-400/500` → `text-muted-foreground`
- `border-zinc-700/800` → `border`
- `hover:bg-zinc-700` → `hover:bg-muted`

### 4. LeadStatusBadge (`lead-status-badge.tsx`)

Upgrade from plain text pill to dot + label design.

**Structure:** `<span>` with inline-flex, containing:
- 6px colored dot (rounded-full)
- Capitalized label text

**Colors (light-mode friendly):**
| Status | Background | Text | Dot |
|--------|-----------|------|-----|
| New | `bg-blue-50` | `text-blue-700` | `bg-blue-500` |
| Contacted | `bg-amber-50` | `text-amber-700` | `bg-amber-500` |
| Qualified | `bg-purple-50` | `text-purple-700` | `bg-purple-500` |
| Converted | `bg-green-50` | `text-green-700` | `bg-green-500` |
| Lost | `bg-zinc-100` | `text-zinc-500` | `bg-zinc-400` |

### 5. LeadDetailPanel — Sheet (`lead-detail-panel.tsx`)

Replace all hardcoded dark-mode classes with semantic tokens.

**Mapping:**
- `bg-zinc-950` → `bg-background`
- `text-zinc-100` → `text-foreground`
- `text-zinc-400/500` → `text-muted-foreground`
- `text-zinc-600` → `text-muted-foreground`
- `border-zinc-800` → `border`
- `bg-zinc-900` → `bg-muted`
- `bg-zinc-800` → `bg-muted`
- `focus-visible:ring-amber-500` → `focus-visible:ring-ring`

**Status changer pills:** Same dot-style as `LeadStatusBadge`. Active pill uses the status-specific active classes (already well-defined, just swap zinc fallbacks for semantic tokens on inactive pills).

**Avatar:** Uses `AVATAR_COLORS` — update to light-mode-friendly pastel backgrounds (same as table avatar colors).

**Booking card, notes, status history:** Replace `bg-zinc-900` with `bg-muted`, `border-zinc-800` with `border`.

**Save Note button:** Replace `bg-amber-500 text-zinc-900` with `bg-primary text-primary-foreground`.

**Convert to Tenant link:** Keep green outline — `border-green-600 text-green-600 hover:bg-green-50`.

### 6. Loading Skeleton (`loading.tsx`)

Update to match the new layout structure:
1. Title + subtitle skeleton (existing)
2. 4 stat card skeletons in a grid (update height to match new taller cards)
3. Pipeline bar skeleton (new — single card with a bar placeholder)
4. Table card skeleton with toolbar bar + 5 row placeholders

## Files Changed

| File | Change |
|------|--------|
| `src/app/superadmin/leads/components/lead-analytics.tsx` | Icon-badged stat cards |
| `src/app/superadmin/leads/components/lead-status-pipeline.tsx` | **New** — status pipeline bar |
| `src/app/superadmin/leads/components/leads-table.tsx` | Card wrapper, avatars, semantic tokens, tab counts |
| `src/app/superadmin/leads/components/lead-status-badge.tsx` | Dot + label design |
| `src/app/superadmin/leads/components/lead-detail-panel.tsx` | Semantic token migration |
| `src/app/superadmin/leads/page.tsx` | Add pipeline component, pass statusBreakdown |
| `src/app/superadmin/leads/loading.tsx` | Updated skeleton layout |
| `src/lib/leads/types.ts` | Add `statusBreakdown` to `LeadStats` |
| `src/lib/leads/leads-analytics.ts` | Compute `statusBreakdown` in `getLeadStats()` |

## Out of Scope

- New features (charts, source breakdown, funnel visualization beyond the bar)
- Backend/API changes (beyond adding `statusBreakdown` count query)
- Dark mode support (using semantic tokens means dark mode works automatically if the theme supports it, but we're not testing/optimizing for it)
- Mobile responsive tweaks to the table (existing responsive behavior preserved)
