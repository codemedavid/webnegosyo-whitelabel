# POS Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the webnegosyo-app mobile admin into a POS-like experience with auto receipt printing on order confirmation, time-filtered dashboard stats, revenue breakdowns, and improved upsell funnel visualization.

**Architecture:** The mobile app (Expo/React Native) reads data from a Convex backend. We add 3 new Convex queries for time-filtered stats, revenue breakdowns, and upsell trends. On the mobile side, we add a printer store (Zustand), receipt formatter, printer settings screen, and enhanced analytics UI with proper charts via `victory-native`.

**Tech Stack:** Expo SDK 54, React Native 0.81.5, Convex, Zustand, `react-native-esc-pos-printer`, `victory-native`, `react-native-svg` (already installed)

---

## Task 1: Install New Dependencies

**Files:**
- Modify: `webnegosyo-app/package.json`

**Step 1: Install packages**

```bash
cd /Users/codemedavid/Documents/whitelabel/webnegosyo-app && npm install react-native-esc-pos-printer victory-native react-native-reanimated
```

> **⚠️ Development Build Required:** `react-native-esc-pos-printer` is a native module that will NOT work in Expo Go. You must use a Development Build (`npx expo prebuild` + native compile) or EAS Build. Configure CI/docs to ensure developers know this.

> **Compatibility:** Confirmed working with Expo SDK 54 / React Native 0.81.5.

> **⚠️ Upstream Security & Maintenance Concerns (as of March 2026):**
> - **Security Issue #247:** Open vulnerability in `EfxExtractor.java` — potential padding oracle attack vector in the Epson ePOS SDK (bundled via `react-native-esc-pos-printer`).
> - **Maintenance status:** 4+ months since last commit, 22 open issues. Consider alternatives or mitigation plans (forking, patching, vendor contact).
>
> **Required Action Items (before production use):**
> 1. **Reproduce & verify the SAST finding:** Run the SAST scanner against our built APK to confirm the `EfxExtractor.java` padding oracle finding is exploitable in our app context (receipt printing over local Bluetooth/LAN, no remote attacker surface).
> 2. **Check Epson ePOS SDK changelog:** Verify whether versions after v2.27.0 of the Epson ePOS SDK patch the `EfxExtractor.java` vulnerability. If patched, update the bundled SDK in `react-native-esc-pos-printer` (fork if needed).
> 3. **Evaluate alternatives for feature parity and maintenance:**
>    - [`@haroldtran/react-native-thermal-printer`](https://www.npmjs.com/package/@haroldtran/react-native-thermal-printer) — ESC/POS over Bluetooth, simpler API
>    - [`react-native-thermal-receipt-printer`](https://www.npmjs.com/package/react-native-thermal-receipt-printer) — BT + network, actively maintained
>    - [`januslo/react-native-bluetooth-escpos-printer`](https://github.com/januslo/react-native-bluetooth-escpos-printer) — BT-only, mature
>    - Compare: Bluetooth + network support, Expo compatibility, ESC/POS command coverage, maintenance activity, open issue count.
> 4. **Risk acceptance (if no upstream fix exists):** Record stakeholder approval for accepting the `EfxExtractor.java` risk. Add an explicit suppression/justification for the scanner finding referencing Issue #247 and `EfxExtractor.java` in the project's security baseline (e.g., `.scannerrc` or equivalent config).
> 5. **CI / Developer Docs:** Update CI pipeline and developer documentation to require a **Development Build** (`npx expo prebuild` + native compile or EAS Build) before using `react-native-esc-pos-printer`. Expo Go does not support native modules.

Note: `react-native-svg` is already installed. `react-native-reanimated` is required by `victory-native`. `react-native-esc-pos-printer` provides Bluetooth + Network thermal printer support via ESC/POS protocol.

**Step 2: Add reanimated babel plugin if not present**

Check `babel.config.js` — if `react-native-reanimated/plugin` is not listed, add it. This is required by `victory-native`.

**Step 3: Commit**

```bash
git add webnegosyo-app/package.json webnegosyo-app/package-lock.json
git commit -m "chore: add printing and charting dependencies for POS features"
```

---

## Task 2: Add Convex Query — getDashboardStatsByPeriod

**Files:**
- Modify: `convex-template/convex/orders.ts` (append new query at end of file)

**Step 1: Add the query**

Append to `convex-template/convex/orders.ts`:

```typescript
export const getDashboardStatsByPeriod = query({
  args: {
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    const allOrders = await ctx.db
      .query("orders")
      .order("desc")
      .collect();

    const filtered = allOrders.filter(
      (o) => o._creationTime >= args.startDate && o._creationTime <= args.endDate
    );

    const totalRevenue = filtered.reduce((sum, o) => sum + o.total, 0);
    const avgOrderValue = filtered.length > 0 ? totalRevenue / filtered.length : 0;

    const statusCounts: Record<string, number> = {
      pending: 0,
      confirmed: 0,
      preparing: 0,
      ready: 0,
      delivered: 0,
      cancelled: 0,
    };

    for (const order of filtered) {
      statusCounts[order.status]++;
    }

    return {
      totalOrders: filtered.length,
      totalRevenue,
      avgOrderValue,
      statusCounts,
    };
  },
});
```

**Step 2: Commit**

```bash
git add convex-template/convex/orders.ts
git commit -m "feat: add getDashboardStatsByPeriod Convex query"
```

---

## Task 3: Add Convex Queries — getRevenueBreakdown & getUpsellTrends

**Files:**
- Modify: `convex-template/convex/analytics.ts` (append two new queries)

**Step 1: Add getRevenueBreakdown**

Append to `convex-template/convex/analytics.ts`:

```typescript
export const getRevenueBreakdown = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const allOrders = await ctx.db
      .query("orders")
      .order("desc")
      .collect();

    const filtered = allOrders.filter(
      (o) => o._creationTime >= cutoff && o.status !== "cancelled"
    );

    // Group by order type
    const orderTypeMap = new Map<string, { revenue: number; count: number }>();
    for (const order of filtered) {
      const type = order.orderType ?? "Unknown";
      const existing = orderTypeMap.get(type) ?? { revenue: 0, count: 0 };
      existing.revenue += order.total;
      existing.count += 1;
      orderTypeMap.set(type, existing);
    }

    // Group by payment method
    const paymentMethodMap = new Map<string, { revenue: number; count: number }>();
    for (const order of filtered) {
      const method = order.paymentMethod ?? "Unknown";
      const existing = paymentMethodMap.get(method) ?? { revenue: 0, count: 0 };
      existing.revenue += order.total;
      existing.count += 1;
      paymentMethodMap.set(method, existing);
    }

    return {
      byOrderType: Array.from(orderTypeMap.entries())
        .map(([type, data]) => ({ type, ...data }))
        .sort((a, b) => b.revenue - a.revenue),
      byPaymentMethod: Array.from(paymentMethodMap.entries())
        .map(([method, data]) => ({ method, ...data }))
        .sort((a, b) => b.revenue - a.revenue),
    };
  },
});
```

**Step 2: Add getUpsellTrends**

Append to `convex-template/convex/analytics.ts`:

```typescript
export const getUpsellTrends = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    // Get upsell events for the period
    const shownEvents = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type", (q) => q.eq("type", "upsell_shown"))
      .collect();
    const convertedEvents = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type", (q) => q.eq("type", "upsell_converted"))
      .collect();

    const recentShown = shownEvents.filter((e) => e._creationTime >= cutoff);
    const recentConverted = convertedEvents.filter((e) => e._creationTime >= cutoff);

    // Group by date for daily rates
    const dailyMap = new Map<string, { shown: number; converted: number }>();
    for (const event of recentShown) {
      const date = new Date(event._creationTime).toISOString().split("T")[0];
      const existing = dailyMap.get(date) ?? { shown: 0, converted: 0 };
      existing.shown += 1;
      dailyMap.set(date, existing);
    }
    for (const event of recentConverted) {
      const date = new Date(event._creationTime).toISOString().split("T")[0];
      const existing = dailyMap.get(date) ?? { shown: 0, converted: 0 };
      existing.converted += 1;
      dailyMap.set(date, existing);
    }

    const dailyRates = Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date,
        rate: data.shown > 0 ? data.converted / data.shown : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calculate total upsell revenue from order items
    const recentOrders = await ctx.db
      .query("orders")
      .order("desc")
      .collect();
    const filteredOrderIds = new Set(
      recentOrders
        .filter((o) => o._creationTime >= cutoff && o.status !== "cancelled")
        .map((o) => o._id)
    );

    const allItems = await ctx.db.query("orderItems").collect();
    const upsellRevenue = allItems
      .filter((i) => filteredOrderIds.has(i.orderId) && i.isUpsellItem)
      .reduce((sum, i) => sum + i.subtotal, 0);

    return {
      dailyRates,
      totalUpsellRevenue: upsellRevenue,
    };
  },
});
```

**Step 3: Commit**

```bash
git add convex-template/convex/analytics.ts
git commit -m "feat: add getRevenueBreakdown and getUpsellTrends Convex queries"
```

---

## Task 4: Create PeriodSelector Component

**Files:**
- Create: `webnegosyo-app/components/PeriodSelector.tsx`

**Step 1: Write the component**

```typescript
import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { colors, typography, spacing, radius } from "../theme/colors";

interface Period {
  label: string;
  value: string;
}

interface PeriodSelectorProps {
  periods: Period[];
  selected: string;
  onSelect: (value: string) => void;
}

export function PeriodSelector({ periods, selected, onSelect }: PeriodSelectorProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {periods.map((period) => (
        <TouchableOpacity
          key={period.value}
          style={[styles.pill, selected === period.value && styles.pillActive]}
          onPress={() => onSelect(period.value)}
          activeOpacity={0.7}
        >
          <Text style={[styles.pillText, selected === period.value && styles.pillTextActive]}>
            {period.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm, paddingBottom: spacing.md },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { ...typography.caption, color: colors.textSecondary, fontWeight: "500" },
  pillTextActive: { color: "#FFFFFF" },
});
```

**Step 2: Commit**

```bash
git add webnegosyo-app/components/PeriodSelector.tsx
git commit -m "feat: add reusable PeriodSelector component"
```

---

## Task 5: Update Dashboard with Period Filtering

**Files:**
- Modify: `webnegosyo-app/app/(main)/dashboard.tsx`

**Step 1: Add period state and date range calculation**

Import `PeriodSelector` and add the new Convex query ref. Add state for the selected period. Compute `startDate`/`endDate` from the period value. When period is "today", use the existing `getDashboardStats` query. For all other periods, use the new `getDashboardStatsByPeriod` query.

The periods are: `today`, `yesterday`, `this_week`, `this_month`, `this_year`.

**Key changes to `dashboard.tsx`:**

1. Add imports:
```typescript
import { useState, useMemo } from "react";
import { PeriodSelector } from "../../components/PeriodSelector";
```

2. Add the new query ref:
```typescript
const getDashboardStatsByPeriodRef = "orders:getDashboardStatsByPeriod" as unknown as FunctionReference<"query">;
```

3. Add period constants:
```typescript
const DASHBOARD_PERIODS = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "This Week", value: "this_week" },
  { label: "This Month", value: "this_month" },
  { label: "This Year", value: "this_year" },
];

function getDateRange(period: string): { startDate: number; endDate: number } {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;

  switch (period) {
    case "yesterday": {
      const start = todayStart - 24 * 60 * 60 * 1000;
      return { startDate: start, endDate: todayStart - 1 };
    }
    case "this_week": {
      const dayOfWeek = now.getDay();
      const start = todayStart - dayOfWeek * 24 * 60 * 60 * 1000;
      return { startDate: start, endDate: todayEnd };
    }
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      return { startDate: start, endDate: todayEnd };
    }
    case "this_year": {
      const start = new Date(now.getFullYear(), 0, 1).getTime();
      return { startDate: start, endDate: todayEnd };
    }
    default: // today
      return { startDate: todayStart, endDate: todayEnd };
  }
}
```

4. Inside `DashboardScreen`, add:
```typescript
const [period, setPeriod] = useState("today");
const dateRange = useMemo(() => getDateRange(period), [period]);

// Use period query for non-today, existing query for today
const { data: periodStats, isLoading: periodLoading } = useSafeQuery<DashboardStats>(
  getDashboardStatsByPeriodRef,
  period !== "today" ? dateRange : "skip"
);

// Merge: use periodStats when available, otherwise stats (today)
const displayStats = period === "today" ? stats : periodStats;
const isStatsLoading = period === "today" ? isLoading : periodLoading;
```

5. Add the `PeriodSelector` above the stat cards:
```tsx
<PeriodSelector periods={DASHBOARD_PERIODS} selected={period} onSelect={setPeriod} />
```

6. Replace `isLoading` with `isStatsLoading` and `stats` with `displayStats` in the JSX for stat cards.

**Step 2: Commit**

```bash
git add webnegosyo-app/app/\(main\)/dashboard.tsx
git commit -m "feat: add period filtering to dashboard stats"
```

---

## Task 6: Create Printer Store (Zustand)

**Files:**
- Create: `webnegosyo-app/stores/printer-store.ts`

**Step 1: Write the store**

```typescript
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface PrinterConfig {
  type: "bluetooth" | "network";
  name: string;
  address: string; // MAC address for BT, IP:port for network
}

interface PrinterState {
  printer: PrinterConfig | null;
  isConnected: boolean;
  autoPrint: boolean;
  setPrinter: (printer: PrinterConfig | null) => void;
  setConnected: (connected: boolean) => void;
  setAutoPrint: (auto: boolean) => void;
  loadSaved: () => Promise<void>;
}

const STORAGE_KEY = "printer_config";

export const usePrinterStore = create<PrinterState>((set) => ({
  printer: null,
  isConnected: false,
  autoPrint: true,
  setPrinter: async (printer) => {
    set({ printer });
    if (printer) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(printer));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  },
  setConnected: (isConnected) => set({ isConnected }),
  setAutoPrint: async (autoPrint) => {
    set({ autoPrint });
    await AsyncStorage.setItem("auto_print", JSON.stringify(autoPrint));
  },
  loadSaved: async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      const autoPrint = await AsyncStorage.getItem("auto_print");
      if (saved) {
        set({ printer: JSON.parse(saved) });
      }
      if (autoPrint !== null) {
        set({ autoPrint: JSON.parse(autoPrint) });
      }
    } catch {
      // Silently fail on corrupt storage
    }
  },
}));
```

**Step 2: Commit**

```bash
git add webnegosyo-app/stores/printer-store.ts
git commit -m "feat: add Zustand printer store with AsyncStorage persistence"
```

---

## Task 7: Create Receipt Formatter

**Files:**
- Create: `webnegosyo-app/lib/receipt-formatter.ts`

**Step 1: Write the receipt formatter**

This builds a plain-text receipt string formatted for 32-char-wide (58mm) or 48-char-wide (80mm) thermal printers.

```typescript
interface ReceiptOrderItem {
  menuItemName: string;
  quantity: number;
  subtotal: number;
  variation?: string;
  variationSelections?: { typeName: string; optionName: string }[];
  addons?: { name: string; price: number }[];
  specialInstructions?: string;
}

interface ReceiptOrder {
  _id: string;
  _creationTime: number;
  customerName: string;
  customerContact: string;
  orderType?: string;
  total: number;
  deliveryFee?: number;
  paymentMethod?: string;
  items?: ReceiptOrderItem[];
}

interface ReceiptConfig {
  storeName: string;
  storeAddress?: string;
  width?: number; // characters per line, default 32
}

function center(text: string, width: number): string {
  const padding = Math.max(0, Math.floor((width - text.length) / 2));
  return " ".repeat(padding) + text;
}

function line(char: string, width: number): string {
  return char.repeat(width);
}

function leftRight(left: string, right: string, width: number): string {
  const gap = Math.max(1, width - left.length - right.length);
  return left + " ".repeat(gap) + right;
}

export function formatReceipt(order: ReceiptOrder, config: ReceiptConfig): string {
  const w = config.width ?? 32;
  const lines: string[] = [];

  // Header
  lines.push(line("=", w));
  lines.push(center(config.storeName.toUpperCase(), w));
  if (config.storeAddress) {
    lines.push(center(config.storeAddress, w));
  }
  lines.push(line("=", w));

  // Order info
  const orderNum = order._id.slice(-8).toUpperCase();
  const date = new Date(order._creationTime);
  const dateStr = date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  const timeStr = date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });

  lines.push(`Order #: ${orderNum}`);
  lines.push(`Date: ${dateStr}  ${timeStr}`);
  lines.push(`Customer: ${order.customerName}`);
  if (order.orderType) {
    lines.push(`Type: ${order.orderType}`);
  }

  // Items
  lines.push(line("-", w));
  lines.push(leftRight("Qty  Item", "Amount", w));
  lines.push(line("-", w));

  let subtotal = 0;
  for (const item of order.items ?? []) {
    const qtyStr = ` ${item.quantity}`;
    const priceStr = `P${item.subtotal.toFixed(2)}`;
    const nameMaxLen = w - qtyStr.length - priceStr.length - 3;
    const name = item.menuItemName.length > nameMaxLen
      ? item.menuItemName.slice(0, nameMaxLen - 1) + "."
      : item.menuItemName;

    lines.push(leftRight(`${qtyStr}  ${name}`, priceStr, w));
    subtotal += item.subtotal;

    // Variation details
    if (item.variationSelections && item.variationSelections.length > 0) {
      for (const sel of item.variationSelections) {
        lines.push(`     - ${sel.optionName}`);
      }
    } else if (item.variation) {
      lines.push(`     - ${item.variation}`);
    }

    // Addons
    if (item.addons && item.addons.length > 0) {
      for (const addon of item.addons) {
        lines.push(`     + ${addon.name}`);
      }
    }

    // Special instructions
    if (item.specialInstructions) {
      lines.push(`     Note: ${item.specialInstructions}`);
    }
  }

  // Totals
  lines.push(line("-", w));
  if (order.deliveryFee && order.deliveryFee > 0) {
    lines.push(leftRight("Subtotal:", `P${subtotal.toFixed(2)}`, w));
    lines.push(leftRight("Delivery Fee:", `P${order.deliveryFee.toFixed(2)}`, w));
  }
  lines.push(line("-", w));
  lines.push(leftRight("TOTAL:", `P${order.total.toFixed(2)}`, w));
  if (order.paymentMethod) {
    lines.push(`Payment: ${order.paymentMethod}`);
  }

  // Footer
  lines.push(line("=", w));
  lines.push(center("Thank you!", w));
  lines.push(line("=", w));
  lines.push(""); // Feed line

  return lines.join("\n");
}
```

**Step 2: Commit**

```bash
git add webnegosyo-app/lib/receipt-formatter.ts
git commit -m "feat: add receipt formatter for thermal printers"
```

---

## Task 8: Create Printer Service

**Files:**
- Create: `webnegosyo-app/lib/printer.ts`

**Step 1: Write the printer service**

This wraps `react-native-esc-pos-printer` with connect/disconnect/print functions.

```typescript
import { Alert, Platform } from "react-native";
import { usePrinterStore } from "../stores/printer-store";

// ESC/POS commands for text formatting
const ESC = "\x1B";
const GS = "\x1D";
const COMMANDS = {
  INIT: `${ESC}@`,           // Initialize printer
  ALIGN_CENTER: `${ESC}a1`,
  ALIGN_LEFT: `${ESC}a0`,
  BOLD_ON: `${ESC}E1`,
  BOLD_OFF: `${ESC}E0`,
  DOUBLE_HEIGHT: `${GS}!0x10`,
  NORMAL_SIZE: `${GS}!0x00`,
  CUT: `${GS}VA`,            // Full cut
  FEED: `${ESC}d\x03`,       // Feed 3 lines
};

let printerModule: any = null;

async function getPrinterModule() {
  if (!printerModule) {
    try {
      printerModule = require("react-native-esc-pos-printer");
    } catch {
      return null;
    }
  }
  return printerModule;
}

export async function discoverBluetoothPrinters(): Promise<Array<{ name: string; address: string }>> {
  const mod = await getPrinterModule();
  if (!mod) return [];

  try {
    const devices = await mod.default.discover({ type: "bluetooth" });
    return (devices ?? []).map((d: any) => ({
      name: d.name || d.deviceName || "Unknown Printer",
      address: d.address || d.macAddress,
    }));
  } catch (err: any) {
    console.warn("Bluetooth discovery failed:", err?.message);
    return [];
  }
}

export async function connectPrinter(type: "bluetooth" | "network", address: string): Promise<boolean> {
  const mod = await getPrinterModule();
  if (!mod) {
    Alert.alert("Printer Error", "Printer module not available. Please rebuild the app with native modules.");
    return false;
  }

  try {
    if (type === "bluetooth") {
      await mod.default.connect({ type: "bluetooth", address });
    } else {
      const [ip, port] = address.split(":");
      await mod.default.connect({ type: "tcp", address: ip, port: parseInt(port || "9100", 10) });
    }
    usePrinterStore.getState().setConnected(true);
    return true;
  } catch (err: any) {
    console.warn("Printer connection failed:", err?.message);
    usePrinterStore.getState().setConnected(false);
    return false;
  }
}

export async function disconnectPrinter(): Promise<void> {
  const mod = await getPrinterModule();
  if (!mod) return;
  try {
    await mod.default.disconnect();
  } catch {
    // Ignore disconnect errors
  }
  usePrinterStore.getState().setConnected(false);
}

export async function printReceipt(receiptText: string): Promise<boolean> {
  const mod = await getPrinterModule();
  if (!mod) return false;

  const { printer, isConnected } = usePrinterStore.getState();
  if (!printer) return false;

  try {
    // Reconnect if needed
    if (!isConnected) {
      const connected = await connectPrinter(printer.type, printer.address);
      if (!connected) return false;
    }

    // Send text with ESC/POS formatting
    const data = COMMANDS.INIT + receiptText + COMMANDS.FEED + COMMANDS.CUT;
    await mod.default.printText(data);
    return true;
  } catch (err: any) {
    console.warn("Print failed:", err?.message);
    usePrinterStore.getState().setConnected(false);
    return false;
  }
}

export async function printTestPage(): Promise<boolean> {
  const testReceipt = [
    "================================",
    "        PRINTER TEST PAGE       ",
    "================================",
    "",
    "If you can read this, your",
    "printer is working correctly!",
    "",
    `Date: ${new Date().toLocaleString()}`,
    `Platform: ${Platform.OS}`,
    "",
    "================================",
    "",
  ].join("\n");

  return printReceipt(testReceipt);
}
```

**Step 2: Commit**

```bash
git add webnegosyo-app/lib/printer.ts
git commit -m "feat: add printer service with ESC/POS support"
```

---

## Task 9: Create Printer Settings Screen

**Files:**
- Create: `webnegosyo-app/app/(main)/printer-settings.tsx`
- Modify: `webnegosyo-app/app/(main)/_layout.tsx` (add hidden route)

**Step 1: Write the printer settings screen**

```typescript
import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Switch,
} from "react-native";
import { router } from "expo-router";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { Card } from "../../components/Card";
import { usePrinterStore } from "../../stores/printer-store";
import {
  discoverBluetoothPrinters,
  connectPrinter,
  disconnectPrinter,
  printTestPage,
} from "../../lib/printer";

interface DiscoveredPrinter {
  name: string;
  address: string;
}

export default function PrinterSettingsScreen() {
  const { printer, isConnected, autoPrint, setPrinter, setAutoPrint } = usePrinterStore();
  const [tab, setTab] = useState<"bluetooth" | "network">(printer?.type ?? "bluetooth");
  const [scanning, setScanning] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredPrinter[]>([]);
  const [networkIp, setNetworkIp] = useState("");
  const [networkPort, setNetworkPort] = useState("9100");
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleScan = async () => {
    setScanning(true);
    const printers = await discoverBluetoothPrinters();
    setDiscovered(printers);
    setScanning(false);
    if (printers.length === 0) {
      Alert.alert("No Printers Found", "Make sure your printer is turned on and in pairing mode.");
    }
  };

  const handleSelectBluetooth = async (device: DiscoveredPrinter) => {
    setConnecting(true);
    const connected = await connectPrinter("bluetooth", device.address);
    if (connected) {
      setPrinter({ type: "bluetooth", name: device.name, address: device.address });
      Alert.alert("Connected", `Connected to ${device.name}`);
    } else {
      Alert.alert("Connection Failed", "Could not connect to printer. Try again.");
    }
    setConnecting(false);
  };

  const handleConnectNetwork = async () => {
    if (!networkIp.trim()) {
      Alert.alert("Error", "Please enter an IP address");
      return;
    }
    setConnecting(true);
    const address = `${networkIp.trim()}:${networkPort.trim() || "9100"}`;
    const connected = await connectPrinter("network", address);
    if (connected) {
      setPrinter({ type: "network", name: `Network (${networkIp})`, address });
      Alert.alert("Connected", `Connected to ${address}`);
    } else {
      Alert.alert("Connection Failed", "Could not connect. Check IP and port.");
    }
    setConnecting(false);
  };

  const handleTestPrint = async () => {
    setTesting(true);
    const success = await printTestPage();
    setTesting(false);
    if (!success) {
      Alert.alert("Test Failed", "Could not print test page. Check printer connection.");
    }
  };

  const handleDisconnect = async () => {
    await disconnectPrinter();
    setPrinter(null);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Printer Settings</Text>

      {/* Current printer status */}
      <Card style={styles.section}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: isConnected ? colors.success : colors.textTertiary }]} />
          <Text style={styles.statusText}>
            {printer ? `${printer.name} (${isConnected ? "Connected" : "Disconnected"})` : "No printer configured"}
          </Text>
        </View>
        {printer && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.smallButton} onPress={handleTestPrint} disabled={testing}>
              {testing ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.smallButtonText}>Test Print</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.smallButton, styles.dangerButton]} onPress={handleDisconnect}>
              <Text style={styles.smallButtonText}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
      </Card>

      {/* Auto-print toggle */}
      <Card style={styles.section}>
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>Auto-Print on Confirm</Text>
            <Text style={styles.toggleSub}>Print receipt when order is confirmed</Text>
          </View>
          <Switch
            value={autoPrint}
            onValueChange={setAutoPrint}
            trackColor={{ true: colors.primary }}
          />
        </View>
      </Card>

      {/* Connection type tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === "bluetooth" && styles.tabActive]}
          onPress={() => setTab("bluetooth")}
        >
          <Text style={[styles.tabText, tab === "bluetooth" && styles.tabTextActive]}>Bluetooth</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "network" && styles.tabActive]}
          onPress={() => setTab("network")}
        >
          <Text style={[styles.tabText, tab === "network" && styles.tabTextActive]}>Network</Text>
        </TouchableOpacity>
      </View>

      {tab === "bluetooth" ? (
        <Card style={styles.section}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleScan} disabled={scanning}>
            {scanning ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Scan for Printers</Text>
            )}
          </TouchableOpacity>

          {discovered.map((device) => (
            <TouchableOpacity
              key={device.address}
              style={styles.deviceRow}
              onPress={() => handleSelectBluetooth(device)}
              disabled={connecting}
            >
              <View>
                <Text style={styles.deviceName}>{device.name}</Text>
                <Text style={styles.deviceAddress}>{device.address}</Text>
              </View>
              {connecting ? <ActivityIndicator size="small" color={colors.primary} /> : (
                <Text style={styles.connectText}>Connect</Text>
              )}
            </TouchableOpacity>
          ))}
        </Card>
      ) : (
        <Card style={styles.section}>
          <Text style={styles.inputLabel}>IP Address</Text>
          <TextInput
            style={styles.input}
            value={networkIp}
            onChangeText={setNetworkIp}
            placeholder="192.168.1.100"
            placeholderTextColor={colors.textTertiary}
            keyboardType="numeric"
          />
          <Text style={styles.inputLabel}>Port</Text>
          <TextInput
            style={styles.input}
            value={networkPort}
            onChangeText={setNetworkPort}
            placeholder="9100"
            placeholderTextColor={colors.textTertiary}
            keyboardType="numeric"
          />
          <TouchableOpacity style={styles.primaryButton} onPress={handleConnectNetwork} disabled={connecting}>
            {connecting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Connect</Text>
            )}
          </TouchableOpacity>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 60 },
  backButton: { marginBottom: spacing.md },
  backText: { ...typography.body, color: colors.primary },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.lg },
  section: { marginBottom: spacing.lg },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { ...typography.body, color: colors.textPrimary, flex: 1 },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  smallButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  dangerButton: { backgroundColor: colors.danger },
  smallButtonText: { ...typography.caption, color: "#FFFFFF", fontWeight: "600" },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  toggleLabel: { ...typography.heading, color: colors.textPrimary },
  toggleSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  tabRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.separator,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { ...typography.body, color: colors.textSecondary, fontWeight: "500" },
  tabTextActive: { color: "#FFFFFF" },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  primaryButtonText: { color: "#FFFFFF", ...typography.heading },
  deviceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.separator,
  },
  deviceName: { ...typography.body, color: colors.textPrimary, fontWeight: "500" },
  deviceAddress: { ...typography.caption, color: colors.textSecondary },
  connectText: { ...typography.body, color: colors.primary, fontWeight: "600" },
  inputLabel: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
  },
});
```

**Step 2: Add hidden route to tab layout**

In `webnegosyo-app/app/(main)/_layout.tsx`, add inside the `<Tabs>`:

```tsx
<Tabs.Screen
  name="printer-settings"
  options={{ href: null, title: "Printer Settings" }}
/>
```

**Step 3: Commit**

```bash
git add webnegosyo-app/app/\(main\)/printer-settings.tsx webnegosyo-app/app/\(main\)/_layout.tsx
git commit -m "feat: add printer settings screen with BT and network support"
```

---

## Task 10: Wire Auto-Print to Order Confirmation

**Files:**
- Modify: `webnegosyo-app/app/(main)/order/[orderId].tsx`
- Modify: `webnegosyo-app/app/(main)/orders.tsx`

**Step 1: Add print-on-confirm to order detail screen**

In `order/[orderId].tsx`:

1. Add imports:
```typescript
import { usePrinterStore } from "../../../stores/printer-store";
import { printReceipt } from "../../../lib/printer";
import { formatReceipt } from "../../../lib/receipt-formatter";
import { useAuthStore } from "../../../stores/auth-store";
```

2. Inside `OrderDetailScreen`, add:
```typescript
const tenantName = useAuthStore((s) => s.tenantName);
const { autoPrint, printer } = usePrinterStore();
```

3. Modify `handleUpdateStatus` to trigger print when status changes to "confirmed":
```typescript
const handleUpdateStatus = async (newStatus: OrderStatus) => {
  if (!order) return;
  try {
    await updateStatus({ orderId: order._id, status: newStatus });

    // Auto-print receipt on confirm
    if (newStatus === "confirmed" && autoPrint && printer) {
      const receipt = formatReceipt(order, { storeName: tenantName ?? "Store" });
      const printed = await printReceipt(receipt);
      if (!printed) {
        Alert.alert("Print Warning", "Order confirmed but receipt could not be printed.");
      }
    }
  } catch {
    Alert.alert("Error", "Failed to update status");
  }
};
```

4. Add a "Reprint Receipt" button in the actions section (after the primary action button):
```tsx
{order.status !== "pending" && order.status !== "cancelled" && printer && (
  <TouchableOpacity
    style={styles.reprintButton}
    onPress={async () => {
      const receipt = formatReceipt(order, { storeName: tenantName ?? "Store" });
      const printed = await printReceipt(receipt);
      if (!printed) {
        Alert.alert("Print Failed", "Could not print receipt.");
      }
    }}
    activeOpacity={0.8}
  >
    <Text style={styles.reprintText}>Reprint Receipt</Text>
  </TouchableOpacity>
)}
```

5. Add styles:
```typescript
reprintButton: {
  borderWidth: 1,
  borderColor: colors.primary,
  borderRadius: radius.md,
  paddingVertical: 14,
  alignItems: "center",
},
reprintText: {
  color: colors.primary,
  ...typography.heading,
},
```

**Step 2: Add print-on-confirm to orders list**

In `orders.tsx`, add the same logic to `handleUpdateStatus` so confirming from the list also prints. Import the same printer/receipt modules.

**Step 3: Commit**

```bash
git add webnegosyo-app/app/\(main\)/order/\[orderId\].tsx webnegosyo-app/app/\(main\)/orders.tsx
git commit -m "feat: auto-print receipt on order confirmation + reprint button"
```

---

## Task 11: Add Printer Icon to Dashboard Header

**Files:**
- Modify: `webnegosyo-app/app/(main)/dashboard.tsx`

**Step 1: Add printer icon + load saved printer**

1. Add imports:
```typescript
import { usePrinterStore } from "../../stores/printer-store";
```

2. In `DashboardScreen`, add:
```typescript
const { printer, isConnected, loadSaved } = usePrinterStore();

useEffect(() => {
  loadSaved();
}, []);
```

3. Add a printer button in the header between the greeting and logout:
```tsx
<View style={styles.headerRight}>
  <TouchableOpacity
    onPress={() => router.push("/(main)/printer-settings")}
    style={styles.printerButton}
  >
    <Text style={{ fontSize: 20 }}>🖨</Text>
    <View style={[styles.printerDot, { backgroundColor: isConnected ? colors.success : colors.textTertiary }]} />
  </TouchableOpacity>
  <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
    <Text style={styles.logoutText}>Sign Out</Text>
  </TouchableOpacity>
</View>
```

4. Add styles:
```typescript
headerRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
printerButton: { position: "relative", padding: spacing.sm },
printerDot: { position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: 4 },
```

**Step 2: Commit**

```bash
git add webnegosyo-app/app/\(main\)/dashboard.tsx
git commit -m "feat: add printer status icon to dashboard header"
```

---

## Task 12: Improve Analytics — Revenue Breakdown

**Files:**
- Modify: `webnegosyo-app/app/(main)/analytics.tsx`

**Step 1: Add revenue breakdown section**

1. Add new query ref:
```typescript
const getRevenueBreakdownRef = "analytics:getRevenueBreakdown" as unknown as FunctionReference<"query">;
```

2. Add interface:
```typescript
interface RevenueBreakdown {
  byOrderType: { type: string; revenue: number; count: number }[];
  byPaymentMethod: { method: string; revenue: number; count: number }[];
}
```

3. Add query:
```typescript
const { data: revenueBreakdown } = useSafeQuery<RevenueBreakdown>(getRevenueBreakdownRef, { daysBack });
```

4. Add a new `Card` section after "Top Items by Revenue" showing two horizontal bar charts — one for order type breakdown, one for payment method breakdown. Each bar shows the label, a colored bar proportional to max, and the revenue amount.

**Revenue breakdown visual (for each group):**
```tsx
<Card title="Revenue by Order Type" style={styles.section}>
  {!revenueBreakdown ? (
    <LoadingState />
  ) : revenueBreakdown.byOrderType.length === 0 ? (
    <EmptyState message="No data yet" />
  ) : (
    revenueBreakdown.byOrderType.map((item) => {
      const maxRevenue = revenueBreakdown.byOrderType[0]?.revenue ?? 1;
      const barPct = Math.max((item.revenue / maxRevenue) * 100, 5);
      return (
        <View key={item.type} style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>{item.type}</Text>
          <View style={styles.breakdownBarTrack}>
            <View style={[styles.breakdownBarFill, { width: `${barPct}%`, backgroundColor: colors.primary }]} />
          </View>
          <Text style={styles.breakdownValue}>₱{item.revenue.toFixed(0)}</Text>
        </View>
      );
    })
  )}
</Card>
```

Same pattern for `byPaymentMethod` with a different color (e.g., `colors.success`).

5. Add styles:
```typescript
breakdownRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, gap: spacing.sm },
breakdownLabel: { ...typography.caption, color: colors.textPrimary, fontWeight: "500", width: 70 },
breakdownBarTrack: { flex: 1, height: 8, backgroundColor: colors.separator, borderRadius: 4 },
breakdownBarFill: { height: 8, borderRadius: 4 },
breakdownValue: { ...typography.caption, color: colors.primary, fontWeight: "600", width: 60, textAlign: "right" },
```

**Step 2: Commit**

```bash
git add webnegosyo-app/app/\(main\)/analytics.tsx
git commit -m "feat: add revenue breakdown by order type and payment method"
```

---

## Task 13: Improve Analytics — Upsell Funnel Visualization & Trends

**Files:**
- Modify: `webnegosyo-app/app/(main)/analytics.tsx`

**Step 1: Add upsell trends query**

1. Add query ref:
```typescript
const getUpsellTrendsRef = "analytics:getUpsellTrends" as unknown as FunctionReference<"query">;
```

2. Add interface:
```typescript
interface UpsellTrends {
  dailyRates: { date: string; rate: number }[];
  totalUpsellRevenue: number;
}
```

3. Add query:
```typescript
const { data: upsellTrends } = useSafeQuery<UpsellTrends>(getUpsellTrendsRef, { daysBack });
```

**Step 2: Improve the upsell funnel card**

Replace the existing text-only funnel with visual stepped bars:

```tsx
<Card title="Upsell Performance" style={styles.section}>
  {!upsellStats ? (
    <LoadingState />
  ) : (
    <>
      {/* Upsell revenue headline */}
      {upsellTrends && (
        <View style={styles.upsellRevenueRow}>
          <Text style={styles.upsellRevenueValue}>₱{upsellTrends.totalUpsellRevenue.toFixed(0)}</Text>
          <Text style={styles.upsellRevenueLabel}>Upsell Revenue</Text>
        </View>
      )}

      {/* Visual funnel bars */}
      <View style={styles.funnelBarsContainer}>
        {[
          { label: "Shown", value: upsellStats.shown, color: colors.info },
          { label: "Clicked", value: upsellStats.clicked, color: colors.warning },
          { label: "Converted", value: upsellStats.converted, color: colors.success },
        ].map((step) => {
          const maxVal = Math.max(upsellStats.shown, 1);
          const heightPct = Math.max((step.value / maxVal) * 100, 5);
          return (
            <View key={step.label} style={styles.funnelBarItem}>
              <Text style={styles.funnelBarValue}>{step.value}</Text>
              <View style={[styles.funnelBar, { height: heightPct, backgroundColor: step.color }]} />
              <Text style={styles.funnelBarLabel}>{step.label}</Text>
            </View>
          );
        })}
      </View>

      {/* Rates */}
      <View style={styles.rateRow}>
        <View style={styles.rateItem}>
          <Text style={styles.rateValue}>{(upsellStats.clickRate * 100).toFixed(1)}%</Text>
          <Text style={styles.rateLabel}>Click Rate</Text>
        </View>
        <View style={styles.rateItem}>
          <Text style={styles.rateValue}>{(upsellStats.conversionRate * 100).toFixed(1)}%</Text>
          <Text style={styles.rateLabel}>Conversion</Text>
        </View>
      </View>

      {/* Daily conversion rate trend */}
      {upsellTrends && upsellTrends.dailyRates.length > 0 && (
        <View style={styles.trendSection}>
          <Text style={styles.trendTitle}>Daily Conversion Rate</Text>
          <View style={styles.trendBars}>
            {upsellTrends.dailyRates.map((d) => {
              const barH = Math.max(d.rate * 100, 2);
              return (
                <View key={d.date} style={styles.trendBarItem}>
                  <View style={[styles.trendBar, { height: barH, backgroundColor: colors.success }]} />
                  <Text style={styles.trendBarLabel}>{d.date.slice(5)}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </>
  )}
</Card>
```

**Step 3: Add funnel bar styles**

```typescript
funnelBarsContainer: { flexDirection: "row", justifyContent: "center", alignItems: "flex-end", gap: spacing.xl, height: 120, paddingTop: spacing.md },
funnelBarItem: { alignItems: "center", width: 60 },
funnelBar: { width: 40, borderRadius: 4, minHeight: 4 },
funnelBarValue: { fontSize: 16, fontWeight: "700", color: colors.textPrimary, marginBottom: spacing.xs },
funnelBarLabel: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
upsellRevenueRow: { alignItems: "center", paddingVertical: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.separator, marginBottom: spacing.sm },
upsellRevenueValue: { fontSize: 28, fontWeight: "700", color: colors.success },
upsellRevenueLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
trendSection: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 0.5, borderTopColor: colors.separator },
trendTitle: { ...typography.caption, color: colors.textSecondary, fontWeight: "600", marginBottom: spacing.sm },
trendBars: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 60 },
trendBarItem: { flex: 1, alignItems: "center" },
trendBar: { width: "80%", borderRadius: 2, minHeight: 2 },
trendBarLabel: { fontSize: 7, color: colors.textTertiary, marginTop: 2 },
```

**Step 4: Commit**

```bash
git add webnegosyo-app/app/\(main\)/analytics.tsx
git commit -m "feat: visual upsell funnel bars, conversion trends, and upsell revenue"
```

---

## Task 14: Load Printer Config on App Start

**Files:**
- Modify: `webnegosyo-app/app/_layout.tsx`

**Step 1: Load saved printer config in root layout**

Add to the root layout's initialization (after auth check):

```typescript
import { usePrinterStore } from "../stores/printer-store";

// Inside the layout component, after auth init:
useEffect(() => {
  usePrinterStore.getState().loadSaved();
}, []);
```

This ensures the printer config is loaded from AsyncStorage on every app launch.

**Step 2: Commit**

```bash
git add webnegosyo-app/app/_layout.tsx
git commit -m "feat: load saved printer config on app startup"
```

---

## Task 15: Final Lint & Verification

**Step 1: Run TypeScript check**

```bash
cd /Users/codemedavid/Documents/whitelabel/webnegosyo-app && npx tsc --noEmit
```

Fix any type errors.

**Step 2: Verify all screens render (manual)**

Start the dev server and verify:
- Dashboard shows period selector chips, printer icon
- Printer settings screen accessible from dashboard
- Analytics shows revenue breakdown + improved funnel
- Order detail has reprint button

**Step 3: Final commit if needed**

```bash
git add -A
git commit -m "fix: resolve lint and type errors from POS enhancements"
```
