# WebNegosyo POS (Desktop)

Electron desktop app for merchants: live order management + automatic POS receipt printing.

Mirrors the `webnegosyo-app` mobile admin flow:

1. **Login** — Supabase email/password → `app_users` lookup (`role` must be `admin` or `superadmin`) → `tenants` lookup for `convex_deployment_url`.
2. **Orders** — per-tenant Convex client subscribes to `orders:getRealtimeQueue` (pending / confirmed / preparing / ready columns). Status changes go through `orders:updateOrderStatus`.
3. **Auto-print** — when a new order appears in the pending queue, the full order is fetched via `orders:getOrderById` and a receipt is silently printed from the Electron main process (hidden window + `webContents.print`). Printed order IDs are persisted in `userData/pos-settings.json` so restarts never reprint.

## Setup

```bash
cd webnegosyo-desktop
npm install
npm run dev        # dev mode with hot reload
npm run dist:win   # Windows installer (run on Windows)
npm run dist:mac   # macOS build
```

`.env` needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (same values as the mobile admin app; see `.env.example`).

## Printing

- Works with any printer installed in the OS, including thermal receipt printers (Epson TM, XPrinter, GOOJPRT, etc.) via their Windows/macOS drivers.
- **Settings** (top right) lets you pick the printer, paper width (58mm / 80mm), footer message, and toggle auto-print.
- Receipts can be reprinted manually from the order detail panel (labeled `REPRINT`).
- Printing is silent — no dialog. Leave printer empty to use the system default.

## Notes

- If the tenant has no `convex_deployment_url`, the app shows a notice after login (no Supabase-realtime fallback here — set up Convex for the tenant).
- A two-tone chime + toast fires on every new pending order.
