# Upgrade Pair Wizard — Design Spec

## Problem

The current upgrade pair creation form is a flat, unguided experience — two dropdowns, several text fields, and a preview all shown at once. Merchants find it confusing and don't understand what an "upgrade pair" is or how to set one up. The form doesn't teach the concept or guide decisions.

## Solution

Replace the flat form with a 3-step wizard that breaks the task into one decision per screen, with contextual explanations at each step. The wizard handles both creation and editing of upgrade pairs.

## Design Decisions

- **No smart suggestions panel** — removed entirely. Manual creation only, guided well.
- **Visual item grid** instead of dropdowns — searchable cards with images, names, and prices. Scales from 10 to 100+ items via search + category filter pills.
- **Wizard replaces tab content** — opens as a full-width panel within the Upgrade Pairs tab, not a modal.
- **Edit mode** uses the same wizard, pre-filled with existing pair data. "Create Upgrade Pair" button becomes "Save Changes".

## Step 1: Pick the Basic Item

**Purpose:** Select the item the customer originally orders.

**Layout:**
- Progress bar at top: 3 labeled steps (Basic Item / Upgrade Item / Customize). Step 1 active (purple).
- Green explainer callout: "What's the basic item? This is the item your customer originally orders — like a single burger or a regular coffee. You'll pick the upgrade option in the next step."
- Search bar with placeholder "Search menu items..."
- Category filter pills below search — "All" (active), then one pill per menu category. Horizontally scrollable on mobile.
- Item grid: 3 columns desktop, 2 columns mobile. Each card shows item image (or placeholder gradient), item name, and price.
- Selected card: purple border + checkmark badge in top-right corner + subtle purple outer glow.
- Only `is_available: true` items shown.
- Footer: disabled "Back" button (first step), selected item name + price in center, purple "Next →" button (enabled only when an item is selected).

**Edit mode:** Pre-selects the existing source item on mount.

## Step 2: Pick the Upgrade Item

**Purpose:** Select the higher-value item to suggest as an upgrade.

**Layout:**
- Progress bar: Step 1 shows green checkmark, Step 2 active (purple), Step 3 grey.
- Pinned source card at top: grey background strip showing the selected basic item (image, name, price) with "→ suggest upgrading to..." text. Provides constant context.
- Green explainer callout: "Pick the upgrade. Choose a higher-value item to suggest — like a meal combo instead of a single burger. The price difference is what motivates the upgrade."
- Same search bar + category filter pills as Step 1.
- Item grid — same layout as Step 1 but with these differences:
  - Source item is greyed out (opacity 0.35) with "Already selected" text, not clickable.
  - Items priced higher than source: green "+₱XX" badge in top-left corner, full opacity.
  - Items priced lower than source: amber "-₱XX" badge in top-left corner, reduced opacity (0.6). Still selectable.
  - Items at same price: no badge, full opacity.
- Selected card: same purple border + checkmark as Step 1.
- Footer: "← Back" button, center shows "Upgrade: {name} ({price}) +₱XX/order" in green, purple "Next →" button.

**Edit mode:** Pre-selects the existing target item on mount.

## Step 3: Customize & Preview

**Purpose:** Optionally customize customer-facing labels and confirm the pair.

**Layout:**
- Progress bar: Steps 1 and 2 show green checkmarks, Step 3 active (purple).
- Pair summary strip: grey background, both items displayed side-by-side with arrow between them and green "+₱XX" price diff badge. Source labeled "BASIC" (grey), target labeled "UPGRADE" (purple). Confirms what was picked.
- **Customize labels section** (optional):
  - "Customize labels (optional)" heading with pencil icon.
  - Header text input — placeholder "e.g. Want to make it a meal?", default "Upgrade your {source item name}?". Max 100 chars. Helper text: "Shown as the title when suggesting the upgrade."
  - Two-column row: Basic item label (default "Ala Carte", max 50 chars) and Upgrade item label (default "Meal", max 50 chars).
- **Live customer preview section:**
  - "Customer preview" heading with eye icon and "Live" badge.
  - Dashed purple border container simulating the inline upgrade section the customer sees.
  - Shows: header text, two side-by-side cards (source with source label badge, target with target label badge + green price diff), item images, names, and prices.
  - Updates in real-time as label fields change.
- Footer: "← Back" button, green "✓ Create Upgrade Pair" button (distinct from purple "Next" buttons).

**Edit mode:** Fields pre-filled. Button says "Save Changes".

## Wizard Shell Component

The wizard shell manages:
- **Step state** — current step (1/2/3), selected source item, selected target item, label values.
- **Navigation** — Back/Next with validation (Next disabled until current step's selection is made).
- **Progress bar** — shared across all steps, shows completed (green ✓), active (purple), and pending (grey) states.
- **Entry point** — "Create Upgrade Pair" button in the Upgrade Pairs tab replaces the old inline form. Clicking it renders the wizard in place of the tab content. Cancel/close returns to the pairs list.
- **Edit entry** — clicking an existing pair's edit action opens the wizard pre-filled.
- **Submission** — calls `createUpsellPairAction` (create) with `pair_type: 'upgrade'`. For edit mode, a new `updateUpsellPairAction` server action must be created (delete old + create new, or direct UPDATE — same Zod schema, same cache invalidation as create).

## Component Structure

```
upgrade-pair-wizard.tsx          — Shell: step state, navigation, progress bar
├── wizard-step-source.tsx       — Step 1: source item selection
├── wizard-step-target.tsx       — Step 2: target item selection (receives sourceItem)
├── wizard-step-customize.tsx    — Step 3: labels + preview (receives both items)
└── wizard-item-grid.tsx         — Shared: searchable, filterable item grid
```

All components are client-side (`'use client'`). The item grid is extracted as a shared component since Steps 1 and 2 use the same grid with different decoration logic (price badges, disabled states).

## Data Flow

1. `BoostSalesDashboard` passes `menuItems` (already fetched) and `tenantId`/`tenantSlug` to `UpsellPairsTab`.
2. `UpsellPairsTab` conditionally renders either the pairs list or the wizard.
3. Wizard receives `menuItems` as a prop — no additional data fetching needed.
4. On submit, wizard calls `createUpsellPairAction` with the collected data and closes back to the pairs list on success.
5. Edit: wizard receives an optional `existingPair: UpsellPairWithItems` prop to pre-fill all fields.

## Existing Pairs List Changes

- Remove the old inline creation form (source/target dropdowns, label fields, preview).
- Remove the `SmartUpgradePanel` component import and rendering.
- Add a prominent "Create Upgrade Pair" button at the top of the pairs list.
- Add an edit button (pencil icon) to each existing pair row that opens the wizard pre-filled.
- Keep the existing search/filter and delete functionality on the pairs list as-is.

## Error Handling

- Duplicate pair detection: on submit, if the action returns "This upsell pair already exists", show toast and stay on Step 3.
- Network errors: show toast with error message, keep wizard state intact.
- Empty menu: if no items available, show empty state with message instead of the grid.

## Mobile Responsiveness

- Item grid: 2 columns on mobile, 3 on desktop.
- Category pills: horizontally scrollable on mobile.
- Step 3 label inputs: stack vertically on mobile (1 column instead of 2).
- Pair summary strip: stack vertically on narrow screens.
- Progress bar: hide step labels on mobile, show only numbered circles.
