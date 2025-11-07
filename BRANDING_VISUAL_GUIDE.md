# 🎨 Branding Customization Visual Guide

## Quick Reference: Where Each Color is Applied

### 🎯 Layout Colors

```
┌─────────────────────────────────────────────────────────┐
│  HEADER (header_color)                                  │
│  ┌─────────────────────────────────────────────────┐   │
│  │ [LOGO] Restaurant Name (header_font_color)      │   │
│  │                                     [🛒 Cart]    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  ┌───────────────────────────────────────────────────┐ │
│  │           BACKGROUND (background_color)           │ │
│  │                                                   │ │
│  │  ┌──────────────────────────────────────────┐   │ │
│  │  │  CARD (cards_color)                      │   │ │
│  │  │  ┌────────────────────────────────────┐  │   │ │
│  │  │  │ Menu Item Image                    │  │   │ │
│  │  │  └────────────────────────────────────┘  │   │ │
│  │  │  Title (card_title_color)                 │   │ │
│  │  │  Description (card_description_color)   │   │ │
│  │  │  Muted text (text_muted_color)           │   │ │
│  │  │                                          │   │ │
│  │  │  [Add to Cart] (button_primary_color)   │   │ │
│  │  │                                          │   │ │
│  │  │  Border: cards_border_color              │   │ │
│  │  └──────────────────────────────────────────┘   │ │
│  │                                                   │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 🎨 Color Mapping

| Element | Color Field | Default Value | Purpose |
|---------|-------------|---------------|---------|
| **Layout** |
| Page Background | `background_color` | `#ffffff` | Main app background |
| Header Bar | `header_color` | `#ffffff` | Top navigation bar |
| Header Text | `header_font_color` | `#000000` | Logo & nav text |
| Card Background | `cards_color` | `#ffffff` | Menu item cards |
| Card Border | `cards_border_color` | `#e5e7eb` | Card outlines |
| Card Title | `card_title_color` | `#111111` | Card titles/names |
| Card Price | `card_price_color` | `#111111` | Price on cards |
| Card Description | `card_description_color` | `#6b7280` | Card descriptions |
| General Borders | `border_color` | `#e5e7eb` | Dividers, inputs |
| **Buttons** |
| Primary Button BG | `button_primary_color` | `#111111` | Main action buttons |
| Primary Button Text | `button_primary_text_color` | `#ffffff` | Text on primary buttons |
| Secondary Button BG | `button_secondary_color` | `#f3f4f6` | Secondary actions |
| Secondary Button Text | `button_secondary_text_color` | `#111111` | Text on secondary buttons |
| **Text** |
| Primary Text | `text_primary_color` | `#111111` | Headlines, body text |
| Secondary Text | `text_secondary_color` | `#6b7280` | Descriptions, captions |
| Muted Text | `text_muted_color` | `#9ca3af` | Disabled, subtle text |
| **States** |
| Success | `success_color` | `#10b981` | Success messages, badges |
| Warning | `warning_color` | `#f59e0b` | Warning messages |
| Error | `error_color` | `#ef4444` | Error messages, validation |
| Links | `link_color` | `#3b82f6` | Clickable links |
| Shadows | `shadow_color` | `rgba(0,0,0,0.1)` | Shadows, depth |
| **Legacy** |
| Primary | `primary_color` | `#111111` | Main brand color |
| Secondary | `secondary_color` | `#666666` | Secondary brand |
| Accent | `accent_color` | `#ffd700` | Highlights |

---

## 🖼️ Component Examples

### Menu Page Hero Section

```
┌────────────────────────────────────────────────────────────┐
│                                                             │
│              Hero Title (hero_title_color)                  │
│           Or falls back to text_primary_color               │
│                                                             │
│         Hero Description (hero_description_color)           │
│           Or falls back to text_secondary_color             │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

**Example:**
```tsx
<h1 style={{ color: tenant?.hero_title_color || branding.textPrimary }}>
  {tenant?.hero_title || 'Our Menu'}
</h1>
<p style={{ color: tenant?.hero_description_color || branding.textSecondary }}>
  {tenant?.hero_description || 'Fresh ingredients, made with love'}
</p>
```

---

### Menu Item Card

```
┌──────────────────────────────────┐
│ ┌──────────────────────────────┐ │  ← cards_color
│ │                              │ │
│ │      Menu Item Image         │ │
│ │                              │ │
│ └──────────────────────────────┘ │
│                                  │
│ Burger Deluxe                    │  ← text_primary_color
│ Juicy beef patty with...         │  ← text_secondary_color
│                                  │
│ Available • 150+ sold            │  ← text_muted_color
│                                  │
│ ₱250.00                          │  ← text_primary_color (price)
│                                  │
│ ┌──────────────────────────────┐ │
│ │    Add to Cart               │ │  ← button_primary_color
│ └──────────────────────────────┘ │    + button_primary_text_color
│                                  │
└──────────────────────────────────┘  ← cards_border_color
```

---

### Item Detail Modal

```
╔══════════════════════════════════════════════════════════╗
║  Burger Deluxe                                      [×]  ║  ← Primary text
║  ────────────────────────────────────────────────────── ║  ← border_color
║                                                          ║
║  [Product Image]                                         ║
║                                                          ║
║  Description text goes here...                           ║  ← text_secondary_color
║                                                          ║
║  ┌────────────────────────────────────────────────────┐ ║
║  │ Size (required)                                    │ ║
║  │ ┌──────────┐ ┌──────────┐ ┌──────────┐          │ ║
║  │ │  Small   │ │  Medium  │ │  Large   │          │ ║  ← Selected: primary_color
║  │ │  +₱0     │ │  +₱30    │ │  +₱50    │          │ ║    Not selected: border_color
║  │ └──────────┘ └──────────┘ └──────────┘          │ ║
║  └────────────────────────────────────────────────────┘ ║
║                                                          ║
║  ┌────────────────────────────────────────────────────┐ ║
║  │ Add-ons                                            │ ║
║  │ ☑ Extra Cheese (+₱30)                             │ ║  ← Checked: primary_color
║  │ ☐ Extra Patty (+₱50)                              │ ║
║  └────────────────────────────────────────────────────┘ ║
║                                                          ║
║  Special Instructions                                    ║
║  ┌────────────────────────────────────────────────────┐ ║
║  │ No onions please                                   │ ║  ← border_color (input)
║  └────────────────────────────────────────────────────┘ ║
║                                                          ║
║  ┌───────────┐               ┌────────────────────────┐ ║
║  │  - 1  +   │               │  Add to Cart • ₱330   │ ║  ← button_primary_color
║  └───────────┘               └────────────────────────┘ ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
```

---

### Navbar/Header

```
┌───────────────────────────────────────────────────────────────┐
│ header_color background                                       │
│                                                               │
│  [🍕 Logo]  Restaurant Name                          [🛒 (2)]│
│   ↑              ↑                                      ↑     │
│   Logo        header_font_color                    Badge with │
│               text color                           primary_color
│                                                               │
└───────────────────────────────────────────────────────────────┘
  ↑
  border_color (bottom border)
```

---

### Checkout Page

```
┌─────────────────────────────────────────────────────────────┐
│  Order Summary                          background_color    │
│  ────────────────────────                                   │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Burger Deluxe × 2                                     │ │  cards_color
│  │ Size: Large                                           │ │  with
│  │ Add-ons: Extra Cheese                                 │ │  cards_border_color
│  │                                       ₱660.00         │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  Subtotal                                 ₱660.00           │  text_secondary_color
│  Delivery Fee                              ₱50.00           │
│  ─────────────────────────────────────────────────          │  border_color
│  Total                                    ₱710.00           │  text_primary_color (bold)
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            Place Order                              │   │  button_primary_color
│  └─────────────────────────────────────────────────────┘   │  + button_primary_text_color
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### Status Messages

```
┌─────────────────────────────────────────┐
│ ✓ Order placed successfully!            │  ← success_color (bg tint)
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ ⚠ Some items are out of stock           │  ← warning_color (bg tint)
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ ✗ Failed to process payment              │  ← error_color (bg tint)
└─────────────────────────────────────────┘
```

---

## 🎨 Real-World Branding Examples

### Example 1: Italian Restaurant

```typescript
{
  primary_color: '#c41e3a',        // Italian red
  secondary_color: '#009246',      // Italian green
  accent_color: '#ffffff',         // White
  
  background_color: '#faf8f5',     // Warm off-white
  header_color: '#c41e3a',         // Red header
  header_font_color: '#ffffff',    // White text
  
  button_primary_color: '#c41e3a', // Red buttons
  button_primary_text_color: '#ffffff',
  
  cards_color: '#ffffff',
  cards_border_color: '#e8d5d1',   // Subtle red tint
  
  text_primary_color: '#2d2d2d',
  text_secondary_color: '#6b6b6b',
  text_muted_color: '#999999',
}
```

**Visual Result:**
- Warm, inviting color scheme
- Red header creates strong brand presence
- White cards with red-tinted borders
- Professional yet friendly appearance

---

### Example 2: Modern Coffee Shop

```typescript
{
  primary_color: '#6f4e37',        // Coffee brown
  secondary_color: '#d4a574',      // Latte color
  accent_color: '#f8f4e8',         // Cream
  
  background_color: '#f8f4e8',     // Cream background
  header_color: '#6f4e37',         // Dark brown header
  header_font_color: '#f8f4e8',    // Cream text
  
  button_primary_color: '#6f4e37',
  button_primary_text_color: '#f8f4e8',
  
  cards_color: '#ffffff',
  cards_border_color: '#d4a574',   // Latte border
  
  text_primary_color: '#3d2817',   // Dark brown
  text_secondary_color: '#8b6f47',
  text_muted_color: '#a89b8c',
}
```

**Visual Result:**
- Cozy, warm coffee shop aesthetic
- Earth tones create comfortable atmosphere
- Cream background easy on eyes
- Brown accents tie to coffee theme

---

### Example 3: Fresh Sushi Bar

```typescript
{
  primary_color: '#c20026',        // Sushi red
  secondary_color: '#1a1a1a',      // Black
  accent_color: '#f4f4f4',         // Off-white
  
  background_color: '#ffffff',     // Clean white
  header_color: '#1a1a1a',         // Black header
  header_font_color: '#ffffff',    // White text
  
  button_primary_color: '#c20026',
  button_primary_text_color: '#ffffff',
  
  cards_color: '#fafafa',          // Very light gray
  cards_border_color: '#e0e0e0',
  
  text_primary_color: '#1a1a1a',
  text_secondary_color: '#666666',
  text_muted_color: '#999999',
}
```

**Visual Result:**
- Clean, minimalist Japanese aesthetic
- Black and white with red accents
- Modern and sophisticated
- Emphasizes freshness and quality

---

## 🖱️ Interactive Elements

### Button States

```
Normal State:
┌──────────────┐
│ Add to Cart  │  ← button_primary_color background
└──────────────┘    button_primary_text_color text

Hover State:
┌──────────────┐
│ Add to Cart  │  ← Slightly darker (auto-generated via CSS)
└──────────────┘

Disabled State:
┌──────────────┐
│ Add to Cart  │  ← Faded version (opacity: 0.5)
└──────────────┘
```

### Link Styles

```
Regular link: <a style="color: link_color">Click here</a>

Hover: Slightly darker shade
Visited: Same as regular (no distinction)
Active: Even darker during click
```

### Input Fields

```
┌────────────────────────────────────┐
│ Enter your name                    │  ← border_color (normal)
└────────────────────────────────────┘

┌────────────────────────────────────┐
│ Enter your name▮                   │  ← primary_color (focused)
└────────────────────────────────────┘

┌────────────────────────────────────┐
│ Required field                     │  ← error_color (error state)
└────────────────────────────────────┘
```

---

## 📱 Responsive Behavior

### Mobile Menu

```
Mobile (< 640px):
┌─────────────────────┐
│ [☰]  Logo    [🛒]  │  ← header_color
├─────────────────────┤
│                     │
│ [Menu Item Card]    │  ← Stacks vertically
│                     │
│ [Menu Item Card]    │
│                     │
│ [Menu Item Card]    │
│                     │
└─────────────────────┘
```

### Desktop Menu

```
Desktop (> 1024px):
┌─────────────────────────────────────────────────────┐
│ Logo                                         [🛒]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [Card]  [Card]  [Card]                            │
│                                                     │  ← 3 columns
│  [Card]  [Card]  [Card]                            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

All colors maintain their function across breakpoints.

---

## 🎭 Branding Editor Interface

### Floating Editor Button

```
Bottom-right corner:
                        ┌────┐
                        │ 🎨 │  ← Always visible to admins
                        └────┘
                         ↑
                    Sticky position
```

### Editor Panel (When Open)

```
┌──────────────────────────────────┐
│ Branding Editor  [Close] [Save] │
├──────────────────────────────────┤
│                                  │
│ Hero Title                       │
│ ┌──────────────────────────────┐ │
│ │ Our Menu                     │ │
│ └──────────────────────────────┘ │
│                                  │
│ Hero Description                 │
│ ┌──────────────────────────────┐ │
│ │ Fresh ingredients...         │ │
│ └──────────────────────────────┘ │
│                                  │
│ Primary     Secondary            │
│ ┌───┬────┐  ┌───┬────┐          │
│ │🎨│#111│  │🎨│#666│          │  ← Color pickers
│ └───┴────┘  └───┴────┘          │
│                                  │
│ ... more colors ...              │
│                                  │
└──────────────────────────────────┘
         ↑
    Previews live!
```

---

## 💡 Pro Tips

### Color Combinations that Work Well

1. **High Contrast Header**
   - Dark header (`#1a1a1a`) + White text (`#ffffff`)
   - Creates strong visual hierarchy

2. **Subtle Cards**
   - White background (`#ffffff`)
   - Very light gray cards (`#fafafa`)
   - Light gray borders (`#e5e7eb`)
   - Creates depth without being harsh

3. **Vibrant Buttons**
   - Use primary brand color for buttons
   - Ensure good contrast with white text
   - Test on both light and dark backgrounds

4. **Text Hierarchy**
   - Primary: Nearly black (`#111111` or `#1a1a1a`)
   - Secondary: Medium gray (`#6b7280`)
   - Muted: Light gray (`#9ca3af`)
   - Creates clear reading hierarchy

5. **Consistent Accent**
   - Use primary color sparingly for accents
   - Active states, selected items, badges
   - Don't overuse - maintains impact

---

## 🔍 Debugging Branding Issues

### Check List

```
Issue: Colors not showing
✓ Verify tenant data loaded
✓ Check branding object created
✓ Inspect element style attributes
✓ Look for CSS conflicts
✓ Clear browser cache

Issue: Wrong colors displaying
✓ Check fallback chain
✓ Verify database values
✓ Inspect getTenantBranding() output
✓ Check for hardcoded colors in components
✓ Validate hex format

Issue: Editor not saving
✓ Check console for errors
✓ Verify user permissions
✓ Check RLS policies
✓ Verify network requests
✓ Check database connection
```

---

## 📸 Before & After Examples

### Before Branding (Defaults)

```
Simple, professional look:
- Black text on white background
- Gray borders and subtle shadows
- Generic but functional
```

### After Custom Branding

```
Brand-specific identity:
- Restaurant's actual colors
- Logo in header
- Custom hero message
- Consistent theme throughout
- Memorable and unique
```

---

## 🎯 Quick Start Checklist

For setting up a new tenant's branding:

- [ ] Upload logo (square, min 200×200px)
- [ ] Set primary brand color
- [ ] Set secondary color (complementary)
- [ ] Choose button color (readable with white text)
- [ ] Set header color (contrasts with white text)
- [ ] Customize hero title and description
- [ ] Test on mobile device
- [ ] Check all button states
- [ ] Verify text readability
- [ ] Preview in different browsers
- [ ] Save and publish!

---

**Related Documentation:**
- [BRANDING_CUSTOMIZATION_ANALYSIS.md](./BRANDING_CUSTOMIZATION_ANALYSIS.md) - Complete technical documentation
- [IMPLEMENTATION.md](./IMPLEMENTATION.md) - Project overview

**Last Updated:** November 7, 2025

