// Messenger chat log (20261111224021) in PGlite over release 1 (20261110000421),
// as the role that really runs each query. Every read/write asserts rows or the
// SQLSTATE: RLS refusals are silent.
//
//   - the webhook (service role) writes sessions' profile + lines; a retried
//     line (same mid) is refused, a line can't point at another store's session
//   - readers = the orders rule: store-wide accounts with an order-read key read
//     every chat; a branch account only chats tied to an order of its branch;
//     staff without an order key, other stores and anon read nothing
//   - staff never read the session cart / checkout state, never write
//   - messenger_chat_for_order / messenger_chats run as the caller (RLS decides)
//   - the 30-day purge deletes old lines, clears old previews; cron job once
//
// Live bodies copied 2026-11-12 (pg_get_functiondef): app_user_admin_tenant_id,
// app_user_admin_outlet_id, app_user_is_superadmin, app_user_holds_any_permission,
// and the orders_select_by_tenant policy.
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')
const { STUB_SCHEMA, SEED, U, T_A, T_B } = require('./run-messenger-automations.cjs')

const OUT_A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const OUT_A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const BRANCH_ORDERS = '00000000-0000-4000-8000-000000000011'
const S = {
  a1: 'eeeeeeee-0000-4000-8000-000000000001', // T_A, ordered at branch A1 (twice)
  a2: 'eeeeeeee-0000-4000-8000-000000000002', // T_A, ordered at branch A2
  a3: 'eeeeeeee-0000-4000-8000-000000000003', // T_A, never ordered
  b1: 'eeeeeeee-0000-4000-8000-000000000004', // T_B
}
const O = {
  a1old: 'dddddddd-0000-4000-8000-000000000001',
  a1new: 'dddddddd-0000-4000-8000-000000000002',
  a2: 'dddddddd-0000-4000-8000-000000000003',
  web: 'dddddddd-0000-4000-8000-000000000004',
}

const ORDERS = `
  insert into outlets values ('${OUT_A2}', '${T_A}');
  insert into auth.users values ('${BRANCH_ORDERS}');
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id)
    values ('${BRANCH_ORDERS}', 'admin', '${T_A}', false, '{orders}', '${OUT_A1}');
  create table orders (
    id uuid primary key, tenant_id uuid not null references tenants(id), outlet_id uuid,
    status text not null default 'pending', daily_number integer, customer_data jsonb,
    created_at timestamptz not null default now()
  );
  alter table orders enable row level security;
  CREATE OR REPLACE FUNCTION public.app_user_admin_outlet_id() RETURNS uuid LANGUAGE sql STABLE SET search_path TO 'public'
  AS $function$
    select au.outlet_id from public.app_users au
    where au.user_id = auth.uid() and au.role = 'admin';
  $function$;
  CREATE OR REPLACE FUNCTION public.app_user_admin_tenant_id() RETURNS uuid LANGUAGE sql STABLE SET search_path TO 'public'
  AS $function$
    select au.tenant_id from public.app_users au
    where au.user_id = auth.uid() and au.role = 'admin';
  $function$;
  CREATE OR REPLACE FUNCTION public.app_user_is_superadmin() RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
  AS $function$
    select exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid() and au.role = 'superadmin'
    );
  $function$;
  CREATE OR REPLACE FUNCTION public.app_user_holds_any_permission(p_tenant_id uuid, p_keys text[]) RETURNS boolean
   LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
  AS $function$
    select exists (
      select 1
        from unnest(p_keys) as key
       where public.app_user_has_permission(p_tenant_id, key)
    );
  $function$;
  create policy orders_select_by_tenant on orders for select using (
    (( SELECT app_user_is_superadmin() AS app_user_is_superadmin) OR ((tenant_id = ( SELECT app_user_admin_tenant_id() AS app_user_admin_tenant_id))
      AND ((( SELECT app_user_admin_outlet_id() AS app_user_admin_outlet_id) IS NULL) OR (outlet_id = ( SELECT app_user_admin_outlet_id() AS app_user_admin_outlet_id)))
      AND ( SELECT app_user_holds_any_permission(( SELECT app_user_admin_tenant_id() AS app_user_admin_tenant_id), ARRAY['orders'::text, 'pos'::text, 'kitchen'::text, 'tables'::text, 'analytics'::text, 'reports'::text]) AS app_user_holds_any_permission)))
  );
  insert into orders (id, tenant_id, outlet_id, status, daily_number, customer_data, created_at) values
    ('${O.a1old}', '${T_A}', '${OUT_A1}', 'delivered', 3, '{"messenger_psid":"pA1"}', now() - interval '2 days'),
    ('${O.a1new}', '${T_A}', '${OUT_A1}', 'preparing', 7, '{"messenger_psid":"pA1"}', now() - interval '1 hour'),
    ('${O.a2}', '${T_A}', '${OUT_A2}', 'ready', 4, '{"messenger_psid":"pA2"}', now() - interval '3 hours'),
    ('${O.web}', '${T_A}', '${OUT_A1}', 'pending', 9, '{"name":"Walk-in"}', now());
  -- pg_cron stand-in (the extension is not in PGlite).
  create schema cron;
  create table cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
  create function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint language sql as $$
    insert into cron.job (jobname, schedule, command) values (p_name, p_schedule, p_command) returning jobid
  $$;
  create function cron.unschedule(p_jobid bigint) returns boolean language sql as $$
    delete from cron.job where jobid = p_jobid returning true
  $$;
`

let checks = 0
function eq(actual, expected, message) {
  checks += 1
  assert.deepEqual(actual, expected, message)
}
async function refused(promise, code, message) {
  checks += 1
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `${message}: expected SQLSTATE ${code}, got ${error.code} (${error.message})`)
    return true
  }, message)
}
const rows = async (db, sql, params = []) => (await db.query(sql, params)).rows
const count = async (db, sql, params = []) => Number((await rows(db, sql, params))[0].n)

/** The migration without its `create extension pg_cron` (stubbed above). */
function chatLogMigration() {
  return readMigration('20261111224021_messenger_chat_log.sql').replace(/create extension if not exists pg_cron[^;]*;/i, '')
}

async function checkWebhookWrites(db) {
  await as(db, 'service_role', null)
  for (const [id, tenant, psid, minutesAgo] of [[S.a1, T_A, 'pA1', 5], [S.a2, T_A, 'pA2', 10], [S.a3, T_A, 'pA3', 15], [S.b1, T_B, 'pB1', 20]]) {
    eq((await rows(db, `insert into messenger_sessions (id, tenant_id, psid, first_name, last_name, profile_pic_url, profile_fetched_at, last_message_at, last_message_preview)
      values ($1, $2, $3, 'Juan', 'Dela Cruz', 'https://platform-lookaside.fbsbx.com/x.jpg', now(), now() - ($4 || ' minutes')::interval, 'magkano po?') returning id`,
      [id, tenant, psid, String(minutesAgo)])).length, 1, `the webhook stores session ${psid} with the profile`)
  }
  for (const [session, tenant] of [[S.a1, T_A], [S.a2, T_A], [S.a3, T_A], [S.b1, T_B]]) {
    for (const [index, direction, kind, body] of [[1, 'in', 'text', 'magkano po?'], [2, 'bot', 'card', 'Sent the menu'], [3, 'staff', 'text', 'Hi po!']]) {
      await db.query(`insert into messenger_messages (tenant_id, session_id, direction, kind, body, mid, sent_at)
        values ($1, $2, $3, $4, $5, $6, now() - ($7 || ' minutes')::interval)`,
      [tenant, session, direction, kind, body, direction === 'bot' ? null : `m-${session}-${index}`, String(10 - index)])
    }
  }
  eq(await count(db, 'select count(*) n from messenger_messages'), 12, 'the webhook writes chat lines')
  await refused(db.query(`insert into messenger_messages (tenant_id, session_id, direction, kind, body, mid, sent_at) values ($1, $2, 'in', 'text', 'again', $3, now())`,
    [T_A, S.a1, `m-${S.a1}-1`]), '23505', 'a retried webhook (same mid) never logs a line twice')
  await refused(db.query(`insert into messenger_messages (tenant_id, session_id, direction, kind, body, sent_at) values ($1, $2, 'in', 'text', 'x', now())`,
    [T_B, S.a1]), '23503', "a line can't be filed under another store's session")
  await refused(db.query(`insert into messenger_messages (tenant_id, session_id, direction, kind, body, sent_at) values ($1, $2, 'in', 'text', '', now())`,
    [T_A, S.a1]), '23514', 'an empty line is refused')
  await refused(db.query(`insert into messenger_messages (tenant_id, session_id, direction, kind, body, sent_at) values ($1, $2, 'in', 'text', repeat('x', 1001), now())`,
    [T_A, S.a1]), '23514', 'a line over 1,000 characters is refused')
  await refused(db.query(`insert into messenger_messages (tenant_id, session_id, direction, kind, body, sent_at) values ($1, $2, 'robot', 'text', 'x', now())`,
    [T_A, S.a1]), '23514', 'an unknown direction is refused')
  await refused(db.query("update messenger_sessions set profile_pic_url = 'http://example.com/x.jpg' where id = $1", [S.a1]), '23514',
    'a non-https profile photo is refused')
  await refused(db.query('update messenger_sessions set last_message_preview = repeat($2, 121) where id = $1', [S.a1, 'x']), '23514',
    'a preview over 120 characters is refused')
}

async function visible(db) {
  const sessions = (await rows(db, 'select psid from messenger_sessions order by psid')).map((row) => row.psid)
  const lines = await count(db, 'select count(*) n from messenger_messages')
  return { sessions, lines }
}

async function checkReaders(db) {
  const cases = [
    [U.owner, 'owner', { sessions: ['pA1', 'pA2', 'pA3'], lines: 9 }],
    [U.legacy, 'legacy full-access admin', { sessions: ['pA1', 'pA2', 'pA3'], lines: 9 }],
    [U.ordersOnly, 'staff with orders/pos', { sessions: ['pA1', 'pA2', 'pA3'], lines: 9 }],
    [BRANCH_ORDERS, 'branch A1 account with orders', { sessions: ['pA1'], lines: 3 }],
    [U.settings, 'staff with settings only (no order key)', { sessions: [], lines: 0 }],
    [U.branchSettings, 'branch account without an order key', { sessions: [], lines: 0 }],
    [U.ownerB, "another store's owner", { sessions: ['pB1'], lines: 3 }],
    [U.superadmin, 'superadmin', { sessions: ['pA1', 'pA2', 'pA3', 'pB1'], lines: 12 }],
  ]
  for (const [uid, label, expected] of cases) {
    await as(db, 'authenticated', uid)
    eq(await visible(db), expected, `${label} reads exactly the chats the orders rule allows`)
  }

  await as(db, 'authenticated', U.owner)
  eq((await rows(db, 'select first_name, last_name, profile_pic_url, last_message_preview from messenger_sessions where id = $1', [S.a1]))[0],
    { first_name: 'Juan', last_name: 'Dela Cruz', profile_pic_url: 'https://platform-lookaside.fbsbx.com/x.jpg', last_message_preview: 'magkano po?' },
    'the owner reads the Messenger name, photo and preview')
  await refused(db.query('select cart_data from messenger_sessions'), '42501', 'staff never read the chat cart')
  await refused(db.query('select checkout_state from messenger_sessions'), '42501', '…nor the checkout state')
  await refused(db.query('select * from messenger_sessions'), '42501', '…so select * is refused as a whole')
  await refused(db.query(`insert into messenger_messages (tenant_id, session_id, direction, kind, body, sent_at) values ($1, $2, 'staff', 'text', 'x', now())`,
    [T_A, S.a1]), '42501', 'staff cannot write a chat line')
  await refused(db.query('update messenger_messages set body = $1', ['edited']), '42501', '…nor edit one')
  await refused(db.query('delete from messenger_messages'), '42501', '…nor delete one')
  await refused(db.query("update messenger_sessions set first_name = 'X'"), '42501', '…nor change the session')

  await asAnon(db)
  await refused(db.query('select id from messenger_sessions'), '42501', 'anon reads no session')
  await refused(db.query('select id from messenger_messages'), '42501', 'anon reads no chat line')
  await refused(db.query('select public.messenger_chat_for_order($1)', [O.a1new]), '42501', 'anon cannot call messenger_chat_for_order')
  await refused(db.query('select * from public.messenger_chats($1)', [T_A]), '42501', 'anon cannot call messenger_chats')
}

async function chatFor(db, orderId, limit) {
  const { rows: [row] } = await db.query('select public.messenger_chat_for_order($1, $2) as chat', [orderId, limit ?? 30])
  return row.chat
}

async function checkChatForOrder(db) {
  await as(db, 'authenticated', U.owner)
  const chat = await chatFor(db, O.a1new)
  eq([chat.session.id, chat.session.first_name, chat.session.last_name], [S.a1, 'Juan', 'Dela Cruz'], 'the owner gets the customer behind a Messenger order')
  eq(chat.messages.map((line) => line.body), ['magkano po?', 'Sent the menu', 'Hi po!'], '…and the chat, oldest first')
  eq(chat.messages.map((line) => line.direction), ['in', 'bot', 'staff'], '…with who said each line')
  eq((await chatFor(db, O.a1new, 2)).messages.map((line) => line.body), ['Sent the menu', 'Hi po!'], 'a limit keeps the NEWEST lines')
  eq(await chatFor(db, O.web), null, 'an order that did not come from Messenger has no chat')

  await as(db, 'authenticated', BRANCH_ORDERS)
  eq((await chatFor(db, O.a1new)).session.id, S.a1, 'the branch account reads the chat of its own branch order')
  eq(await chatFor(db, O.a2), null, "…but not another branch's order")

  await as(db, 'authenticated', U.settings)
  eq(await chatFor(db, O.a1new), null, 'staff without an order key get nothing')
  await as(db, 'authenticated', U.ownerB)
  eq(await chatFor(db, O.a1new), null, "another store's owner gets nothing")
}

async function checkChatList(db) {
  await as(db, 'authenticated', U.owner)
  const list = await rows(db, 'select session_id, order_id, order_daily_number, order_status from public.messenger_chats($1)', [T_A])
  eq(list.map((row) => row.session_id), [S.a1, S.a2, S.a3], 'conversations come newest first')
  eq(list.map((row) => [row.order_id, row.order_daily_number, row.order_status]),
    [[O.a1new, 7, 'preparing'], [O.a2, 4, 'ready'], [null, null, null]], '…each with its newest order (none for a chat without one)')
  const page1 = await rows(db, 'select session_id, last_message_at from public.messenger_chats($1, 2)', [T_A])
  eq(page1.map((row) => row.session_id), [S.a1, S.a2], 'the limit pages the list')
  const page2 = await rows(db, 'select session_id from public.messenger_chats($1, 2, $2)', [T_A, page1[1].last_message_at])
  eq(page2.map((row) => row.session_id), [S.a3], '…and `before` returns the next page')

  await as(db, 'authenticated', BRANCH_ORDERS)
  eq((await rows(db, 'select session_id, order_id from public.messenger_chats($1)', [T_A])), [{ session_id: S.a1, order_id: O.a1new }],
    'a branch account lists only its branch chats')
  await as(db, 'authenticated', U.ownerB)
  eq(await rows(db, 'select session_id from public.messenger_chats($1)', [T_A]), [], "another store's owner lists nothing")
}

async function checkPurge(db) {
  await as(db, 'service_role', null)
  await db.query(`insert into messenger_messages (tenant_id, session_id, direction, kind, body, sent_at, created_at)
    values ($1, $2, 'in', 'text', 'old line', now() - interval '31 days', now() - interval '31 days')`, [T_A, S.a3])
  await db.query("update messenger_sessions set last_message_at = now() - interval '31 days' where id = $1", [S.a3])

  await as(db, 'authenticated', U.owner)
  await refused(db.query('select public.purge_messenger_messages()'), '42501', 'staff cannot run the purge')

  await reset(db)
  eq((await rows(db, 'select public.purge_messenger_messages() as n'))[0].n, 1, 'the purge deletes exactly the line older than 30 days')
  eq(await count(db, "select count(*) n from messenger_messages where body = 'old line'"), 0, '…it is gone')
  eq(await count(db, 'select count(*) n from messenger_messages'), 12, '…and every newer line stays')
  eq((await rows(db, 'select last_message_preview from messenger_sessions where id = $1', [S.a3]))[0].last_message_preview, null,
    'a preview older than 30 days is cleared too')
  eq((await rows(db, 'select last_message_preview from messenger_sessions where id = $1', [S.a1]))[0].last_message_preview, 'magkano po?',
    '…a fresh one stays')
  eq(await rows(db, "select schedule, command from cron.job where jobname = 'messenger-messages-purge'"),
    [{ schedule: '17 * * * *', command: 'select public.purge_messenger_messages()' }], 'one hourly purge job, even after a re-run')
}

async function checkCascade(db) {
  await reset(db)
  await db.query('delete from messenger_sessions where id = $1', [S.b1])
  eq(await count(db, 'select count(*) n from messenger_messages where tenant_id = $1', [T_B]), 0, "deleting a session deletes its chat lines")
}

async function main() {
  const db = new PGlite()
  try {
    await installPlatformAuth(db)
    await db.exec(STUB_SCHEMA)
    await db.exec(SEED)
    await db.exec(ORDERS)
    await db.exec(readMigration('20261110000421_messenger_automations.sql'))
    for (let pass = 0; pass < 2; pass += 1) await db.exec(chatLogMigration())
    await reset(db)
    await checkWebhookWrites(db)
    await checkReaders(db)
    await checkChatForOrder(db)
    await checkChatList(db)
    await checkPurge(db)
    await checkCascade(db)
    console.log(`Messenger chat log SQL: ${checks} checks passed (migration applied twice: idempotent)`)
  } finally {
    await db.close()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
