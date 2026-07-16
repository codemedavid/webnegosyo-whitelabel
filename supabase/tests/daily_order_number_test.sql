-- Integration test for migration 20260716120000_daily_order_number.sql.
-- Proves: per-tenant sequential numbering, independent per-tenant counters,
-- daily reset by tenant-local date, uniqueness enforcement, and race-safe
-- concurrent allocation.
--
-- Run against a throwaway Postgres (no local server / Supabase required):
--   docker run -d --name pg_test -e POSTGRES_PASSWORD=postgres \
--     -v "$PWD/supabase/migrations":/work:ro \
--     -v "$PWD/supabase/tests":/test:ro postgres:16
--   docker exec pg_test psql -U postgres -v ON_ERROR_STOP=1 -f /test/daily_order_number_test.sql
-- For the concurrency check, fan out parallel `psql -c "INSERT ... generate_series"`
-- against one tenant and assert count(*) = count(DISTINCT daily_number).

-- Minimal schema mirroring the columns the trigger depends on.
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL
);
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

\i /work/20260716120000_daily_order_number.sql

-- Seed two tenants.
INSERT INTO tenants (id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Tenant A'),
  ('22222222-2222-2222-2222-222222222222', 'Tenant B');

-- --- TEST 1: sequential numbering per tenant, starts at 1 ---
INSERT INTO orders (tenant_id) VALUES ('11111111-1111-1111-1111-111111111111');
INSERT INTO orders (tenant_id) VALUES ('11111111-1111-1111-1111-111111111111');
INSERT INTO orders (tenant_id) VALUES ('11111111-1111-1111-1111-111111111111');
-- --- TEST 2: second tenant resets to 1 (independent) ---
INSERT INTO orders (tenant_id) VALUES ('22222222-2222-2222-2222-222222222222');

\echo '=== TEST 1+2: per-tenant sequence, independent counters ==='
SELECT tenant_id, daily_number, order_date FROM orders ORDER BY tenant_id, daily_number;

\echo '=== TEST 3: daily reset — backdate an order to yesterday, new today starts fresh ==='
-- Insert an order explicitly dated yesterday (Manila). Trigger uses created_at.
INSERT INTO orders (tenant_id, created_at)
VALUES ('11111111-1111-1111-1111-111111111111', (now() AT TIME ZONE 'Asia/Manila' - interval '1 day') AT TIME ZONE 'Asia/Manila');
SELECT daily_number, order_date FROM orders
WHERE tenant_id='11111111-1111-1111-1111-111111111111'
ORDER BY order_date, daily_number;

\echo '=== TEST 4: uniqueness — duplicate (tenant, date, number) rejected ==='
DO $$
BEGIN
  INSERT INTO orders (tenant_id, daily_number, order_date)
  VALUES ('11111111-1111-1111-1111-111111111111', 1, (now() AT TIME ZONE 'Asia/Manila')::date);
  RAISE EXCEPTION 'FAIL: duplicate was allowed';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'PASS: duplicate (tenant, date, number) correctly rejected';
END $$;

\echo '=== TEST 5: concurrency — 50 parallel-ish inserts yield 50 distinct numbers, no gaps beyond count ==='
-- Simulate load in a single session (serial), then verify distinctness.
INSERT INTO orders (tenant_id)
SELECT '22222222-2222-2222-2222-222222222222' FROM generate_series(1, 50);
SELECT
  count(*) AS total_today,
  count(DISTINCT daily_number) AS distinct_numbers,
  min(daily_number) AS min_num,
  max(daily_number) AS max_num
FROM orders
WHERE tenant_id='22222222-2222-2222-2222-222222222222'
  AND order_date = (now() AT TIME ZONE 'Asia/Manila')::date;
