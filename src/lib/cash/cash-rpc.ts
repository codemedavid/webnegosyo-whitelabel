/**
 * How the cash screens call the database: through the CALLER's own session
 * client (cookie session on the server, the browser client in a sheet), so
 * RLS, `cash_manage` and `reports` decide what comes back. Never pass a
 * service-role client here.
 *
 * The new RPCs and tables (CONTRACTS §2, §4) are not in the generated types
 * until their migrations are applied live, so this is the ONE narrow cast for
 * them; everything that comes back is parsed with zod before it is used.
 *
 * Every call returns a result instead of throwing, so one failing card never
 * takes the page down.
 */

export interface CashDbError {
  code?: string
  message: string
}

export interface CashRpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: CashDbError | null }>
}

/** Narrow a generated Supabase client to the one method these reads use. */
export function asCashRpcClient(client: unknown): CashRpcClient {
  return client as CashRpcClient
}

export type CashFailureKind = 'forbidden' | 'invalid' | 'failed'

export interface CashFailure {
  kind: CashFailureKind
  /** Safe to show staff (never Postgres text). */
  message: string
}

export type CashResult<T> = { ok: true; data: T } | { ok: false; error: CashFailure }

export const INSUFFICIENT_PRIVILEGE = '42501'
export const INVALID_PARAMETER = '22023'

export const CASH_FAILED_MESSAGE = 'This couldn’t load. Try again in a moment.'

export function cashFailure(kind: CashFailureKind, message: string): CashResult<never> {
  return { ok: false, error: { kind, message } }
}

interface CallOptions {
  /** Shown on 42501. */
  forbiddenMessage: string
  /** Shown on anything else. */
  failedMessage?: string
  /** Shown on 22023 (a value the function refused); defaults to the failed message. */
  invalidMessage?: string
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** One RPC: call, classify the error, parse the reply. Logs the detail server-side only. */
export async function callCashRpc<T>(
  client: CashRpcClient,
  fn: string,
  args: Record<string, unknown>,
  parse: (data: unknown) => T,
  { forbiddenMessage, failedMessage = CASH_FAILED_MESSAGE, invalidMessage }: CallOptions,
): Promise<CashResult<T>> {
  let reply: { data: unknown; error: CashDbError | null }
  try {
    reply = await client.rpc(fn, args)
  } catch (error) {
    console.error(`[cash] ${fn} failed`, errorText(error))
    return cashFailure('failed', failedMessage)
  }
  if (reply.error) {
    const { code, message } = reply.error
    if (code === INSUFFICIENT_PRIVILEGE) return cashFailure('forbidden', forbiddenMessage)
    if (code === INVALID_PARAMETER) return cashFailure('invalid', invalidMessage ?? failedMessage)
    console.error(`[cash] ${fn} failed`, `${code ?? 'no code'}: ${message}`)
    return cashFailure('failed', failedMessage)
  }
  try {
    return { ok: true, data: parse(reply.data) }
  } catch (error) {
    console.error(`[cash] ${fn} returned an unexpected shape`, errorText(error))
    return cashFailure('failed', failedMessage)
  }
}
