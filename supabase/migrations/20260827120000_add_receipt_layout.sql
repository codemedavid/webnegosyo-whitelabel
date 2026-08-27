-- Per-tenant thermal receipt layout.
--
-- NULL (the default for every existing tenant) means the Classic preset —
-- byte-for-byte the receipt the app has always printed. The column may hold
-- either a preset name ("classic" | "compact" | "detailed", stored as a JSON
-- string) or a custom block-stack object {"version":1,"blocks":[...]} authored
-- by the web admin's receipt editor. Readers shape-check it and fall back to
-- Classic on anything invalid (see webnegosyo-app/lib/receipt-layout.ts).
alter table public.tenants
  add column if not exists receipt_layout jsonb;

comment on column public.tenants.receipt_layout is
  'Thermal receipt layout: preset name (JSON string) or {version:1,blocks:[...]}. NULL = Classic preset.';
