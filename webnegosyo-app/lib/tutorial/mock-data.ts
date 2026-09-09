/**
 * The store the guided tour is set in.
 *
 * Every scene draws from this one day of trade so the numbers agree with each
 * other across screens: the pending order on Home is the one confirmed on
 * Orders, cooked on Kitchen and paid for at the register. Timestamps are
 * relative to "now" so ages and timers read naturally whenever the tour runs.
 */

import type { OrderCardOrder } from "../../components/OrderCard";
import type { KitchenItemLike, KitchenOrderLike } from "../kitchen-tickets";
import type { StockItemView } from "../inventory-stock";

const MINUTE = 60_000;
const now = () => Date.now();

export interface MockOrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
  detail?: string;
}

export interface MockOrder extends OrderCardOrder {
  lines: MockOrderItem[];
}

export const MOCK_CUSTOMER = {
  name: "Maria Santos",
  contact: "0917 555 0142",
};

/** The order the tour follows from chime to hand-over. */
export function mockIncomingOrder(): MockOrder {
  return {
    _id: "tour-order-1",
    _creationTime: now() - 0.5 * MINUTE,
    customerName: MOCK_CUSTOMER.name,
    customerContact: MOCK_CUSTOMER.contact,
    total: 325,
    itemCount: 3,
    orderType: "pickup",
    status: "pending",
    source: "web",
    paymentStatus: "pending",
    lines: [
      { name: "Iced Latte", quantity: 2, unitPrice: 120, detail: "Size: Large · less ice" },
      { name: "Butter Croissant", quantity: 1, unitPrice: 85 },
    ],
  };
}

/** The rest of the morning's queue, oldest first. */
export function mockQueue(): MockOrder[] {
  return [
    {
      _id: "tour-order-2",
      _creationTime: now() - 6 * MINUTE,
      customerName: "Jun Reyes",
      customerContact: "0920 555 0198",
      total: 515,
      itemCount: 4,
      orderType: "dine_in",
      status: "preparing",
      source: "web",
      paymentStatus: "paid",
      customerData: { table_number: "4" },
      lines: [
        { name: "Ham & Cheese Croissant", quantity: 2, unitPrice: 150 },
        { name: "Matcha Latte", quantity: 1, unitPrice: 135 },
        { name: "Spanish Latte", quantity: 1, unitPrice: 80 },
      ],
    },
    {
      _id: "tour-order-3",
      _creationTime: now() - 14 * MINUTE,
      customerName: "Ana Cruz",
      customerContact: "0918 555 0077",
      total: 180,
      itemCount: 2,
      orderType: "delivery",
      status: "ready",
      source: "web",
      paymentStatus: "paid",
      lines: [{ name: "Spanish Latte", quantity: 2, unitPrice: 90 }],
    },
    {
      _id: "tour-order-4",
      _creationTime: now() - 22 * MINUTE,
      customerName: "Leo Tan",
      total: 90,
      itemCount: 1,
      orderType: "pickup",
      status: "ready",
      source: "pos",
      paymentStatus: "paid",
      lines: [{ name: "Spanish Latte", quantity: 1, unitPrice: 90 }],
    },
    {
      _id: "tour-order-5",
      _creationTime: now() - 48 * MINUTE,
      customerName: "Bea Lim",
      total: 240,
      itemCount: 2,
      orderType: "pickup",
      status: "delivered",
      source: "web",
      paymentStatus: "paid",
      lines: [{ name: "Iced Latte", quantity: 2, unitPrice: 120 }],
    },
  ];
}

export const MOCK_TODAY = {
  revenue: 4_130,
  orderCount: 11,
  avgOrder: 375.45,
  activeNow: 3,
  delivered: 8,
};

export function mockKitchenTicket(): { order: KitchenOrderLike; items: KitchenItemLike[] } {
  return {
    order: {
      _id: "tour-order-1",
      _creationTime: now() - 4 * MINUTE,
      customerName: MOCK_CUSTOMER.name,
      status: "confirmed",
      orderType: "pickup",
    },
    items: [
      {
        orderId: "tour-order-1",
        menuItemName: "Iced Latte",
        quantity: 2,
        variationSelections: [{ typeName: "Size", optionName: "Large" }],
        specialInstructions: "less ice",
      },
      { orderId: "tour-order-1", menuItemName: "Butter Croissant", quantity: 1 },
    ],
  };
}

export interface MockProduct {
  id: string;
  name: string;
  price: number;
  category: string;
  cost?: number;
  isAvailable: boolean;
  hasOptions: boolean;
}

export const MOCK_CATEGORIES = ["Drinks", "Pastries", "Meals"];

export function mockProducts(): MockProduct[] {
  return [
    { id: "p1", name: "Iced Latte", price: 120, category: "Drinks", cost: 45, isAvailable: true, hasOptions: false },
    { id: "p2", name: "Butter Croissant", price: 85, category: "Pastries", cost: 32, isAvailable: true, hasOptions: false },
    { id: "p3", name: "Ham & Cheese Croissant", price: 150, category: "Pastries", cost: 63, isAvailable: true, hasOptions: false },
    { id: "p4", name: "Matcha Latte", price: 135, category: "Drinks", cost: 58, isAvailable: true, hasOptions: false },
    { id: "p5", name: "Spanish Latte", price: 90, category: "Drinks", isAvailable: true, hasOptions: false },
    { id: "p6", name: "Tuna Melt", price: 175, category: "Meals", cost: 80, isAvailable: true, hasOptions: false },
  ];
}

export function mockStock(): StockItemView[] {
  return [
    { id: "s1", name: "Espresso beans", quantity: 0, reorderLevel: 2, stockUnitId: "kg", unitAbbreviation: "kg", level: "out" },
    { id: "s2", name: "Fresh milk", quantity: 2.5, reorderLevel: 6, stockUnitId: "l", unitAbbreviation: "L", level: "low" },
    { id: "s3", name: "Croissant dough", quantity: 6, reorderLevel: 12, stockUnitId: "pc", unitAbbreviation: "pcs", level: "low" },
    { id: "s4", name: "Cheddar", quantity: 3.2, reorderLevel: 1, stockUnitId: "kg", unitAbbreviation: "kg", level: "ok" },
    { id: "s5", name: "Cups 16oz", quantity: 410, reorderLevel: 100, stockUnitId: "pc", unitAbbreviation: "pcs", level: "ok" },
    { id: "s6", name: "Matcha powder", quantity: 900, reorderLevel: 200, stockUnitId: "g", unitAbbreviation: "g", level: "ok" },
  ];
}

export const MOCK_BRANCHES = [
  { id: "b1", name: "Main branch", revenue: 12_480, orders: 34, verdict: "On pace" },
  { id: "b2", name: "BGC kiosk", revenue: 6_150, orders: 19, verdict: "Slow lunch" },
  { id: "b3", name: "Katipunan", revenue: 9_300, orders: 27, verdict: "On pace" },
];

export const MOCK_GUESTS = [
  { name: "Maria Santos", orders: 1, lastLabel: "12 days ago", spend: 325 },
  { name: "Jun Reyes", orders: 6, lastLabel: "today", spend: 2_910 },
  { name: "Ana Cruz", orders: 1, lastLabel: "26 days ago", spend: 180 },
  { name: "Leo Tan", orders: 3, lastLabel: "2 days ago", spend: 430 },
  { name: "Bea Lim", orders: 1, lastLabel: "19 days ago", spend: 240 },
];
