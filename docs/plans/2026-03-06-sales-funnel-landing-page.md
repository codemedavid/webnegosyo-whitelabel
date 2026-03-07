# Sales Funnel Landing Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current generic SaaS landing page with a long-form direct response sales funnel that positions WebNegosyo's Smart Menu as a salesperson for food businesses.

**Architecture:** Complete rewrite of `src/components/landing/landing-page.tsx` as a single client component with 10 scroll sections. Uses Framer Motion for scroll-triggered animations, Lucide icons, and Shadcn UI primitives. All CTAs open Facebook Messenger. No new routes or data fetching needed.

**Tech Stack:** Next.js 15, React, Framer Motion, Tailwind CSS 4, Lucide React, Shadcn UI (Button, Card, Badge)

**Design doc:** `docs/plans/2026-03-06-sales-funnel-landing-page-design.md`

---

### Task 1: Scaffold the new landing page structure with navigation and hero

**Files:**
- Rewrite: `src/components/landing/landing-page.tsx` (currently 867 lines, replacing entirely)
- Modify: `src/app/page.tsx:12` (update metadata description to match new P3,499 offer)

**Step 1: Update page metadata**

In `src/app/page.tsx`, update the metadata to reflect the new positioning:

```typescript
export const metadata: Metadata = {
  title: 'WebNegosyo - Your Menu Should Be Your Best Salesperson',
  description: 'Smart Menu System na nagbo-boost ng Average Order Value para sa food businesses. Menu Engineering, Bundling System, at Upsell Automation. P3,499 one-time.',
  keywords: ['smart menu', 'restaurant menu engineering', 'upsell system', 'food business Philippines', 'online ordering', 'messenger ordering', 'average order value'],
  openGraph: {
    title: 'WebNegosyo - Your Menu Should Be Your Best Salesperson',
    description: 'Smart Menu System na nagbo-boost ng Average Order Value para sa food businesses.',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
}
```

**Step 2: Create the new landing page with navigation + hero section**

Replace all content of `src/components/landing/landing-page.tsx` with the new funnel. This step builds the sticky nav and dark hero section.

The navigation should have:
- WebNegosyo logo (red square + text, same as current)
- Desktop nav links: The Problem, The System, Pricing, FAQ
- Mobile hamburger menu (simple state toggle)
- CTA button: "Book a Call" → Messenger

The hero section (dark background `#0F172A`):
- Social proof badges row: "100+ Restaurants", "10,000+ Orders", "Works with Messenger"
- Main headline: "Your Menu Should Be Your Best Salesperson" (white, `text-5xl md:text-6xl lg:text-7xl`, font-bold)
- Subheadline (Taglish): "Karamihan sa food businesses, nag-iiwan ng pera sa mesa sa bawat order. We fix that." (gray-300, `text-xl md:text-2xl`)
- CTA button (red `#FF3B30`, large): "Book Your Free 15-Min Strategy Call" with MessageCircle icon → opens Messenger
- Hero visual placeholder: A styled div representing a phone mockup (can be replaced with real image later)

Key implementation details:
- `'use client'` directive at top (needed for Framer Motion + mobile menu state)
- Messenger link: `https://m.me/FACEBOOK_PAGE_ID?text=Hi%2C%20I%20want%20to%20learn%20more%20about%20the%20Smart%20Menu%20System` (placeholder page ID)
- Extract `MESSENGER_LINK` as a constant at top of file for reuse across all CTAs
- Use `BRAND_RED = '#FF3B30'` and `DARK_BG = '#0F172A'` constants
- Framer Motion `motion.div` with `initial={{ opacity: 0, y: 20 }}` and `whileInView={{ opacity: 1, y: 0 }}` for each section
- Import `useInView` from framer-motion for scroll-triggered animations

**Step 3: Verify the hero renders**

Run: `npm run dev`
Check: Visit `http://localhost:3000` — dark hero section with headline, subheadline, CTA, and nav should render. CTA should open Messenger link in new tab.

**Step 4: Commit**

```bash
git add src/components/landing/landing-page.tsx src/app/page.tsx
git commit -m "feat: scaffold sales funnel landing page with nav and hero section"
```

---

### Task 2: Add the McDonald's Story section (Section 2) and Problem section (Section 3)

**Files:**
- Modify: `src/components/landing/landing-page.tsx`

**Step 1: Add the McDonald's Story section**

White background section with id `story`. Content:

- Section title (English, bold): "What McDonald's Knows That Most Food Businesses Don't"
- Storytelling body in Taglish (see design doc Section 2 for exact copy)
- Key phrase **"The menu IS the salesperson."** styled with `font-bold text-red-500` to stand out
- Visual: Two cards side by side — "Traditional Menu" (static list, no suggestions, gray/muted) vs "Smart Menu" (upsell prompts, bundles, highlighted items, uses brand red accents)
- Transition line: "We built the same system — for your business." (centered, bold, `text-2xl`)

**Step 2: Add the Problem section**

Dark background section (`#0F172A`) with id `problem`. Content:

- Title (English): "You're Not Losing Because of Foot Traffic. You're Losing Because Your Menu Isn't Selling."
- 3 pain point cards in a responsive grid (`grid-cols-1 md:grid-cols-3 gap-8`)
- Each card: dark card background (`bg-white/5 border border-white/10 rounded-2xl p-8`), icon at top (TrendingDown, Users, DollarSign from Lucide), Taglish pain point text
- Pain points (exact copy from design doc Section 3)

Both sections use Framer Motion `motion.div` with `whileInView` fade-in animation and `viewport={{ once: true, amount: 0.3 }}`.

**Step 3: Verify**

Run dev server, scroll down — McDonald's story on white bg, problem section on dark bg should appear with smooth scroll animations.

**Step 4: Commit**

```bash
git add src/components/landing/landing-page.tsx
git commit -m "feat: add McDonald's story and problem sections to funnel"
```

---

### Task 3: Add the Solution section (Section 4) and Smart Menu System section (Section 5)

**Files:**
- Modify: `src/components/landing/landing-page.tsx`

**Step 1: Add the Solution section**

White background section with id `system`. Content:

- Title: "Introducing the Smart Menu That Sells For You"
- 4 blueprint cards in `grid-cols-1 md:grid-cols-2 gap-8` layout
- Each card: white bg, subtle border, rounded-2xl, p-8, icon (use Lucide: LayoutGrid, BarChart3, Smartphone, Package), English title bold, Taglish description below
- Cards should have hover effect: `hover:-translate-y-1 hover:shadow-lg transition-all`
- Exact copy from design doc Section 4

**Step 2: Add the Smart Menu Ordering System section**

Dark background section. Content:

- Title: "Plus: Your Very Own Smart Menu Ordering System"
- Left side: Feature bullet list with Check icons (green) + Taglish descriptions (exact copy from design doc Section 5)
- Right side: Styled mockup placeholder (rounded rectangle with gradient border representing a phone screen showing a menu)
- Layout: `flex flex-col lg:flex-row gap-12 items-center`

**Step 3: Verify**

Scroll through — solution cards on white, system features on dark with side-by-side layout on desktop.

**Step 4: Commit**

```bash
git add src/components/landing/landing-page.tsx
git commit -m "feat: add solution blueprints and smart menu system sections"
```

---

### Task 4: Add How It Works (Section 6) and Value Stack (Section 7)

**Files:**
- Modify: `src/components/landing/landing-page.tsx`

**Step 1: Add How It Works section**

White background section with id `process`. Content:

- Title: "How It Works"
- 3 numbered steps in horizontal layout (`flex flex-col md:flex-row gap-8`)
- Each step: large number (1/2/3) in a red circle, bold step title, Taglish description
- Connecting line/arrow between steps on desktop (use a simple border-t or SVG line)
- Exact copy from design doc Section 6

**Step 2: Add Value Stack section**

Dark background section with id `pricing`. Content:

- Title: "Everything You Get"
- Stack list: Each deliverable in a row with name on left, value (struck-through style) on right
- Use `border-b border-white/10` between rows for separation
- Items: Smart Menu Ordering System (P10,000), Menu Curation Blueprint (P2,500), Menu Engineering Blueprint (P2,500), App Selling System Blueprint (P2,500), Bundling System (P2,500)
- Total row: "Total Value: P20,000+" bold
- Price reveal: Large text "Pero hindi mo babayaran ng ganun." then **"P3,499 lang."** in `text-5xl font-bold` with brand red color
- CTA button below: "Book Your Free Strategy Call" → Messenger

**Step 3: Verify**

Check 3-step process renders horizontally on desktop, value stack has proper strikethrough values and big price reveal.

**Step 4: Commit**

```bash
git add src/components/landing/landing-page.tsx
git commit -m "feat: add how-it-works and value stack pricing sections"
```

---

### Task 5: Add Testimonials (Section 8), FAQ (Section 9), and Final CTA (Section 10)

**Files:**
- Modify: `src/components/landing/landing-page.tsx`

**Step 1: Add Testimonials section**

White background section with id `testimonials`. Content:

- Title: "What Business Owners Say"
- 3 testimonial cards in `grid-cols-1 md:grid-cols-3 gap-8`
- Each card: quote text (Taglish, italic), before/after AOV metric (placeholder like "AOV: P180 → P250"), name + business type in bold below
- Star rating (5 stars using Star icon from Lucide, filled yellow)
- Use placeholder data from design doc Section 8
- Cards styled: white bg, shadow-sm, rounded-2xl, p-8, border

**Step 2: Add FAQ section**

White background section with id `faq`. Content:

- Title: "Frequently Asked Questions"
- 6 FAQ items as expandable accordions (use simple `useState` toggle, no external lib)
- Each: question as bold clickable row with ChevronDown icon that rotates on open, answer slides down
- Questions and Taglish answers from design doc Section 9

**Step 3: Add Final CTA section**

Dark background section. Content:

- Title: "Stop Leaving Money on the Table"
- Body text (Taglish) from design doc Section 10
- Large CTA button: "Book Your Free 15-Min Strategy Call" → Messenger
- Below CTA: small text "Free consultation. Walang bayad. Walang commitment."

**Step 4: Add Footer**

Dark background (slightly darker or same as CTA section). Content:

- WebNegosyo logo + copyright year
- Simple links: Privacy Policy, Terms (can be # placeholder links)
- Keep it minimal

**Step 5: Verify full funnel flow**

Run dev server, scroll through all 10 sections top to bottom. Check:
- All sections render with correct backgrounds (alternating dark/white)
- CTAs open Messenger link
- Scroll animations trigger on each section
- Responsive: check mobile viewport (375px) — everything stacks, text is readable
- FAQ accordions open/close properly

**Step 6: Commit**

```bash
git add src/components/landing/landing-page.tsx
git commit -m "feat: add testimonials, FAQ, final CTA, and footer to complete funnel"
```

---

### Task 6: Polish animations, responsive design, and lint check

**Files:**
- Modify: `src/components/landing/landing-page.tsx`

**Step 1: Add staggered animations**

For grid sections (blueprints, pain points, testimonials), add staggered children animations:
- Parent: `motion.div` with `staggerChildren: 0.1`
- Children: `motion.div` with `variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}`

**Step 2: Add smooth scroll behavior**

Nav links should smooth-scroll to their target sections. Add `scroll-behavior: smooth` to the html element via globals.css or use `scrollIntoView({ behavior: 'smooth' })` on click.

**Step 3: Mobile menu**

Ensure the hamburger menu works on mobile:
- Toggle state shows/hides a slide-down menu panel
- Menu links smooth-scroll and close the panel on click
- Panel uses `AnimatePresence` + `motion.div` for slide animation

**Step 4: Run lint**

Run: `npm run lint`
Fix any lint errors. Common ones to watch for:
- Unused imports from the old landing page
- Missing alt text on images
- `'` vs `&apos;` in JSX text

**Step 5: Final commit**

```bash
git add src/components/landing/landing-page.tsx src/app/globals.css
git commit -m "feat: polish animations, responsive design, and fix lint"
```

---

## Notes for Implementer

- **Messenger link placeholder**: Use `FACEBOOK_PAGE_ID` as placeholder. The actual page ID will be configured later.
- **Images**: No real images yet. Use styled placeholder divs with gradients/icons to represent phone mockups and menu screenshots. These will be replaced with real assets later.
- **Testimonials**: All placeholder content. Structure the data as a typed array at top of file so it's easy to update later.
- **FAQ data**: Same — typed array at top of file.
- **No checkout page changes**: The old `/checkout` route still exists but is no longer linked from the landing page. It can be cleaned up in a future task.
- **The file should be ~600-800 lines** when complete. If it grows beyond that, consider extracting section components into `src/components/landing/sections/` but only if needed.
- **Framer Motion** is already installed (`framer-motion` v12.23.24 in package.json).
- **Copy**: Follow the exact Taglish copy from the design doc. English for headlines/power statements/CTAs, Taglish for storytelling/explanations/filler.
