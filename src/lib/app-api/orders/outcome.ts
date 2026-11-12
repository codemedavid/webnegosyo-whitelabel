import type { AppErrorCode, AppFieldError } from '@/lib/app-contract'

/** What an order-path step answers; the HTTP layer turns it into the envelope. */
export type AppOutcome<T> =
  | { ok: true; data: T; status: 200 | 201 }
  | { ok: false; code: AppErrorCode; message: string; fieldErrors?: readonly AppFieldError[] }

export const okOutcome = <T>(data: T, status: 200 | 201 = 200): AppOutcome<T> => ({ ok: true, data, status })
export const failOutcome = <T = never>(code: AppErrorCode, message: string, fieldErrors?: readonly AppFieldError[]): AppOutcome<T> =>
  fieldErrors?.length ? { ok: false, code, message, fieldErrors } : { ok: false, code, message }
