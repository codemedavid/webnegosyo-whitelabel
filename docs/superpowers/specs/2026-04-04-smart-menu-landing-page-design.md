# Smart Menu Landing Page Redesign

## Overview

Replace the existing 1,536-line landing page (`src/components/landing/landing-page.tsx`) with a simplified, conversion-focused sales funnel. Acquisition.com-style dark hero with centered stack layout, followed by a streamlined text sales letter (TSL) with CTAs after every section directing to `/checkout`.

**Theme:** "You Can Sell More With Smart Menu"
**Target audience:** Filipino food business owners (Taglish copy)
**Offer:** P3,899 one-time payment, Smart Menu System
**CTA destination:** `/checkout` (placeholder for now)

## Page Structure

### Navigation (fixed)
- Logo: "WebNegosyo" (with purple accent)
- Links: Problem, Solution, Pricing, FAQ (anchor links)
- Right: "Get Smart Menu" CTA button (links to `/checkout`)

### Section 1: Hero
- **Style:** Dark background (#0F0B1A), centered stack layout
- **Elements (top to bottom):**
  1. Pill badge: green dot + "Smart Menu System - Para sa Food Business Owners"
  2. Headline: "YOU CAN SELL MORE WITH SMART MENU" (bold uppercase, clamp 40-80px)
  3. Subtitle: Taglish copy about the menu needing to guide, suggest, and push bigger orders
  4. Video placeholder: 16:9 box with play button (purple), caption "See how Smart Menu works"
  5. Supporting copy: One line about automating upsells, bundles, upgrades
  6. CTA: "GET SMART MENU NOW — P3,899" (purple gradient button)
  7. Sub-CTA text: "One-time payment - No monthly fees - Lifetime access"
- **Visual effects:** Purple radial glow, dot grid pattern, bottom fade gradient

### Section 2: Problem
- **Tag:** "The Problem"
- **Headline:** "Your Menu Is Leaving Money on the Table"
- **3 cards (dark, red-tinted icons):**
  1. **Ordering Friction** — customers browse aimlessly, get confused, order the obvious, leave
  2. **No Upsell System** — no upgrade prompts, no "add drinks?", no "make it a meal?" — bare minimum orders
  3. **Margin Gets Buried** — best items and bundles hidden at bottom, same presentation for everything
- **CTA strip:** "FIX YOUR MENU NOW — P3,899"

### Section 3: Solution
- **Tag:** "The Solution"
- **Headline:** "Smart Menu Does the Selling for You"
- **4 cards (purple-tinted, each tagged "Dine-in - Pick-up - Delivery"):**
  1. **Smart Bundles & Combos** — automatic "make it a meal?" prompts
  2. **Upgrade Pairs** — side-by-side ala carte vs. upgrade comparison
  3. **Checkout Upsells** — "before you go..." last-minute suggestions
  4. **Menu Engineering** — star items, hidden gems, slow movers dashboard
- **CTA strip:** "START SELLING SMARTER — P3,899"

### Section 4: Social Proof
- **Tag:** "Trusted by Restaurant Owners"
- **Headline:** "The Numbers Speak for Themselves"
- **3 stats:** 100+ restaurant funnels, 10,000+ orders processed, 3x average order value increase
- **CTA strip:** "JOIN 100+ RESTAURANTS — P3,899"

### Section 5: Pricing
- **Tag:** "Simple Pricing"
- **Headline:** "One Price. Everything Included."
- **Single pricing card:**
  - Title: Smart Menu System
  - Price: P3,899 (one-time, lifetime access)
  - 10 included features: bundles, upgrade pairs, checkout upsells, menu engineering, 12 card templates, 6 page layouts, hero designer, dine-in/pick-up/delivery, mobile-first flow, lifetime updates
  - CTA: "GET SMART MENU NOW" (full-width button)

### Section 6: FAQ
- **5 questions (Taglish):**
  1. Kailangan ko ba ng technical skills? (No, we handle setup)
  2. Pang-dine-in lang ba ito? (No, all order types)
  3. May monthly fee ba? (No, one-time)
  4. Gaano kabilis ma-setup? (48 hours)
  5. Paano kung hindi gumana? (Works for any food business with a menu)
- **CTA:** "GET STARTED — P3,899"

### Section 7: Final CTA
- **Headline:** "Stop Leaving Money on Every Order"
- **Copy:** Short urgency line in Taglish
- **CTA:** "GET SMART MENU NOW — P3,899" (largest button on page)
- **Sub-CTA:** "One-time payment - No monthly fees - 48-hour setup"
- **Visual:** Purple radial glow from bottom

### Footer
- Simple: "WebNegosyo - Smart Menu System - 2026"

## Design System

- **Background:** Dark (#0a0a0a, #0F0B1A, #111 alternating)
- **Accent:** Purple (#7c3aed, #6d28d9 gradient)
- **Success/trust:** Green (#22c55e for dots, checkmarks)
- **Problem accent:** Red (rgba for card icons)
- **Typography:** System font stack, uppercase bold headlines, -0.04em letter spacing
- **CTAs:** Purple gradient, bold uppercase, 0.06em letter spacing, box shadow
- **Cards:** Subtle borders (rgba white), rounded-16px, dark fill with tinted accents

## Technical Notes

- **File:** Replace content in `src/components/landing/landing-page.tsx`
- **Keep:** `'use client'` directive, framer-motion for scroll animations, `BookingPopup` import can be removed
- **CTA links:** All point to `/checkout` (placeholder)
- **Navigation:** Fixed top, blur backdrop, anchor links to sections
- **Responsive:** clamp() for headline sizes, stack on mobile, flex-wrap for stats
- **Video:** Placeholder div with play button — no actual video embed yet
- **Remove:** BookingPopup component and multi-step booking flow (replaced by direct checkout)
- **Keep:** Existing constants pattern (BRAND colors, content arrays) but update values
