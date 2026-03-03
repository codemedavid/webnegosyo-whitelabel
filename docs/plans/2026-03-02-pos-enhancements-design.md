# POS Enhancements Design — WebNegosyo Mobile Admin App

**Date:** 2026-03-02
**Status:** Approved

## Goal

Transform the mobile admin app into a POS-like experience: auto-print receipts on order confirmation, add revenue filtering by time period, improve analytics with revenue breakdowns and better upsell funnel visualization.

## 1. Auto Receipt Printing

### Printer Support
- **Bluetooth thermal printers** (e.g., Epson TM-T20, Star SM-L200) via ESC/POS
- **Network/WiFi printers** via TCP socket + ESC/POS
- Library: `react-native-esc-pos-printer` (latest: v4.5.0)
  > **⚠️ Compatibility Warning:** Before adopting, validate the following:
  > 1. Confirm v4.5.0 is compatible with your React Native and Expo SDK versions (test on both managed and bare Expo workflows).
  > 2. Run a local build + test print on target Android and iOS toolchains to verify ESC/POS command support.
  > 3. Document any required patches (e.g., native module linking, pod install fixes).
  > 4. If incompatibilities are found, evaluate maintained fork alternatives:
  >    - `@haroldtran/react-native-thermal-printer` (maintained fork of react-native-thermal-receipt-printer)
  >    - `thiendangit/react-native-thermal-receipt-printer-image-qr` (adds image/QR support)
  >    - `@ccdilan/react-native-bluetooth-escpos-printer@0.2.0` or newer (maintained fork of react-native-bluetooth-escpos-printer)
  >    **Note:** Before adopting any fork, verify its maintenance status (recent commits, open issues) and test on your target Android/iOS toolchains.

### Printer Settings Screen
- Accessible from dashboard header (gear/printer icon)
- **Bluetooth tab:** Scan for nearby printers, pair, test print
- **Network tab:** Enter IP address + port, test print
- Printer config persisted via Zustand + AsyncStorage
- Show connected printer name/status on dashboard header

### Print Trigger
- Fires immediately after `orders:updateOrderStatus({ status: "confirmed" })` mutation succeeds
- Non-blocking: if printer unavailable, show toast warning, don't block confirm action
- Option to manually reprint from order detail screen

### Receipt Layout (80mm thermal)
```
================================
       [STORE NAME]
     [Store Address]
================================
Order #: WN-001234
Date: Mar 2, 2026  2:30 PM
Customer: Juan Dela Cruz
Order Type: Delivery
--------------------------------
Qty  Item                  Amount
--------------------------------
 2   Chicken Adobo         ₱360.00
     - Large
     - Extra Rice
 1   Halo-Halo             ₱120.00
     - Regular
--------------------------------
Subtotal:              ₱480.00
Delivery Fee:           ₱50.00
--------------------------------
TOTAL:                 ₱530.00
Payment: GCash
================================
     Thank you! Order again
        at [slug].web...
================================
```

## 2. Dashboard Revenue Filtering

### Current State
- Dashboard shows "today only" stats: total orders, revenue, AOV, active orders

### New Behavior
- **Period selector chips** at top: Today | Yesterday | This Week | This Month | This Year
- All stat cards update to reflect selected period
- Order queue section remains real-time (unaffected by filter)

### Backend
- New Convex query: `orders:getDashboardStatsByPeriod({ startDate, endDate })`
- Returns: `{ totalOrders, totalRevenue, avgOrderValue, ordersByStatus }`

## 3. Analytics Improvements

### Revenue Breakdown (New Section)
- Horizontal stacked bar or pie chart
- Split by **order type** (dine-in, pickup, delivery)
- Split by **payment method** (cash, GCash, card, etc.)
- Period selector (7d / 14d / 30d) — reuse existing pattern
- New Convex query: `analytics:getRevenueBreakdown({ daysBack })`
- Returns: `{ byOrderType: [{type, revenue, count}], byPaymentMethod: [{method, revenue, count}] }`

### Upsell Funnel Improvements
- Replace text-only stats with **visual stepped funnel bars** showing dropoff
- Add **conversion rate trend** line chart (daily rate over selected period)
- Add **upsell revenue** headline number (total ₱ attributed to upsell items)
- New Convex query: `analytics:getUpsellTrends({ daysBack })`
- Returns: `{ dailyRates: [{date, rate}], totalUpsellRevenue }`

## 4. New Dependencies

| Package | Purpose |
|---------|---------|
| `@haroldtran/react-native-thermal-printer` | BLE + Network thermal printing (maintained fork) |
| `victory-native` | Charts (funnel bars, pie, trend lines) |
| `react-native-svg` | Required peer dep for victory-native |

## 5. New Files

```
webnegosyo-app/
├── app/(main)/printer-settings.tsx    # Printer config screen
├── lib/printer.ts                     # Print service (connect, format, print)
├── lib/receipt-formatter.ts           # ESC/POS receipt layout builder
├── stores/printer-store.ts            # Printer connection state (Zustand)
├── components/PeriodSelector.tsx       # Reusable time period chips
├── components/FunnelChart.tsx          # Visual funnel bar chart
├── components/RevenueBreakdown.tsx     # Pie/bar charts for revenue split
```

## 6. Convex Functions Needed

| Function | Type | Purpose |
|----------|------|---------|
| `orders:getDashboardStatsByPeriod` | Query | Dashboard stats for any date range |
| `analytics:getRevenueBreakdown` | Query | Revenue by order type + payment method |
| `analytics:getUpsellTrends` | Query | Daily upsell conversion rates + revenue |

## 7. Out of Scope
- Upsell configuration from mobile (stays on web admin)
- Customer-facing receipt (mobile app is admin only)
- Cash drawer integration
- Barcode/QR scanning
