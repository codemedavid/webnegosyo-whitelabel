# Merchant app — information architecture redesign (2026-09-19)

## The roast

What the app looked like before this change, and why each thing cost the merchant.

1. **The tab bar changed shape under your thumb.** Five "views" (Operations, POS, Insights, Products, Business) each swapped in their own tabs. The bar you learned on Monday was not the bar you saw after switching once. Nothing in a financial app does this.
2. **Four fifths of the app hid behind a 36pt chip.** The view switcher sat at the top-left of every screen. To find Stock you had to know it lived in "Products", open the chip, pick the view, then find the tab. Three taps and one piece of trivia.
3. **A "Menu" tab in a restaurant app that was not the food menu.** It was the app map. Every merchant's first reading was wrong.
4. **Every header spent 44pt on the chip row before the title.** The first thing on every screen was the navigation you did not ask for, then the name of the screen.
5. **Home was a period picker over a KPI card.** Five chips (Today … This Year) sat above the takings, so the first tap on the first screen was a question ("which period?") instead of an answer.
6. **Three round buttons in Home's header, one of which (Account) was a settings screen.** Printer and Scan are shift tools; Account is not.
7. **Kitchen, Schedule and Drawer were peers of the screens they serve.** Kitchen is the same live orders as Orders, for the pass. Drawer is what the register took. They took bar slots instead of hanging under their parents.
8. **Reports were spread over two views and three sub-screens.** "How did last week go?" required knowing whether the chart was in Insights or Products.
9. **Account doubled as a second, smaller hub.** Team, the tour and What's New were listed there and in Menu.
10. **Multi-branch owners landed on a different first screen than everyone else.** The portfolio, with no takings for today, no queue, no quick actions.
11. **The tutorial's first chapter taught the switcher.** Two minutes of a new merchant's attention spent on the app's own navigation debt.
12. **Maestro flows entered every screen through the switcher sheet.** So did the tests: eighteen screens carried a dead import so a guardrail could keep finding it.

## The new shape

One bar, fixed, five slots — a financial-app layout:

| Slot | Tab | What it is |
|---|---|---|
| 1 | **Home** | Today's money, quick actions, the live queue, what needs a hand |
| 2 | **Orders** | Every order. Kitchen and Schedule are buttons in its header |
| 3 | **POS** | The register. Drawer is a button in its header |
| 4 | **Reports** | A hub: Sales (Analytics, Growth), Customers, Products (Performance, Stock report), Branches (Compare) |
| 5 | **Manage** | A hub: Store (Products, Stock, Payments), Branches, People and device (Team, Printer, Scan), Help and account |

Rules, all in one place (`lib/tab-visibility.ts`):

- `BAR_SLOTS` — each slot names its candidates; the first reachable one takes the slot. A cook with only the kitchen grant gets Kitchen in the Orders slot instead of a hole.
- `SUBSCREEN_TABS` + `lib/subscreen-links.ts` — the six screens that hang under a bar tab, and the door each one gets (header buttons for shift screens, foot rows for reading screens).
- `REPORT_TABS` / `SETUP_TABS` + `lib/hubs.ts` — what each hub lists, grouped. `hubs.test.ts` and `tab-visibility.test.ts` prove every registered screen is on the map exactly once.
- The Reports tab exists only when the account can open at least one report; Manage always exists.
- Landing is Home for everyone; a pinned default screen still wins (`lib/default-landing.ts`).

Home (`app/(main)/dashboard.tsx`) now reads top to bottom: shift line (open drawer or not) → takings today with a delta against yesterday → quick actions (New sale, Kitchen, Products, permission-filtered; scanning a pickup is the header's QR button, not a tile) → Orders now (pipeline) → Needs attention → Your branches (multi-branch only).

Removed: `WorkspaceSwitcher`, `stores/workspace-store.ts`, the `showSwitcher`/`leading` header props, the Home period picker, the `switch-view` Maestro helper.

## Not done in this pass

- The other screens (Analytics, Performance, Growth, Stock, Drawer…) kept their content; only their header changed. Each still deserves its own noise pass.
- Tablet layouts for screens other than the POS.
- Maestro flows were rewritten for the new bar but not run against a device.
