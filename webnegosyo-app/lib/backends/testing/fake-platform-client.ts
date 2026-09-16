import type { PlatformClient } from "../platform-client";

/**
 * A recording stand-in for supabase-js, so adapter tests can assert the SHAPE
 * of every query — above all that each read and write is scoped to the
 * caller's tenant. Responses are queued per table and consumed in call order.
 */

export interface RecordedOp {
  readonly method: string;
  readonly args: readonly unknown[];
}

export interface RecordedCall {
  readonly table: string;
  readonly ops: RecordedOp[];
}

export interface TableResponse {
  data: unknown;
  error: { message: string } | null;
}

const CHAINABLE_METHODS = [
  "select",
  "eq",
  "or",
  "neq",
  "in",
  "gte",
  "lte",
  "order",
  "limit",
  "insert",
  "update",
  "upsert",
  "delete",
  "maybeSingle",
  "single",
] as const;

export function fakePlatformClient(responses: Record<string, TableResponse[]>) {
  const calls: RecordedCall[] = [];

  function makeChain(table: string) {
    const call: RecordedCall = { table, ops: [] };
    calls.push(call);

    const chain: Record<string, unknown> = {};
    const record = (method: string) => (...args: unknown[]) => {
      call.ops.push({ method, args });
      return chain;
    };

    for (const method of CHAINABLE_METHODS) {
      chain[method] = record(method);
    }

    chain.then = (
      resolve: (value: TableResponse) => unknown,
      reject?: (reason: unknown) => unknown
    ) => {
      const queue = responses[table] ?? [];
      const next = queue.shift() ?? { data: null, error: null };
      return Promise.resolve(next).then(resolve, reject);
    };

    return chain;
  }

  const client = {
    from: (table: string) => makeChain(table),
  } as unknown as PlatformClient;

  return { client, calls };
}

/** Every op of a given kind across all recorded calls, flattened for assertions. */
export function opsOf(calls: RecordedCall[], method: string): unknown[][] {
  return calls.flatMap((call) =>
    call.ops.filter((op) => op.method === method).map((op) => [...op.args])
  );
}

/** The `eq` filters applied to a table, as `[column, value]` pairs. */
export function eqFiltersOn(calls: RecordedCall[], table: string): unknown[][] {
  return opsOf(
    calls.filter((call) => call.table === table),
    "eq"
  );
}
