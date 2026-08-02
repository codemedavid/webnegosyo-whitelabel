/**
 * Working through one batch of recipients on the merchant's handset.
 *
 * Shaped after `sms/src/screens/today/runFollowUps.ts` — every side effect is
 * injected, and the loop never throws — with three rules the reference did not
 * need, all of which exist because this run is spending a real SIM's quota on
 * real strangers:
 *
 *  1. **Record after the radio confirms, never before.** A row written ahead of
 *     the send would mark an unsent message as delivered, and the resume logic
 *     would then skip it forever.
 *  2. **A rate-limit halts the run.** Once Android starts throttling, pressing
 *     on marks every remaining recipient as failed, which then reads as "these
 *     guests are unreachable" rather than "try again in twenty minutes".
 *  3. **A failed write halts the run.** If the send cannot be recorded, resume
 *     has no way to know it happened, so continuing guarantees someone gets the
 *     same message twice. Stopping costs the merchant a delay; continuing costs
 *     them a complaint.
 */

import { TemplateVariableError, renderMessage } from "./message-template";
import type {
  HaltReason,
  RunOutcome,
  SendRunContext,
  SendRunDeps,
  SmsCustomer,
  SmsSendRecord,
} from "./types";

/** Android's throttle. Retryable later, so it stops the run rather than failing it. */
const RATE_LIMIT_CODE = "LIMIT_EXCEEDED";

function errorCodeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && code !== "" ? code : "UNKNOWN";
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Unknown error";
}

/** Render one message, or describe why this recipient must be skipped. */
function prepare(
  customer: SmsCustomer,
  context: SendRunContext,
  now: string
): { body: string; phone: string } | SmsSendRecord {
  if (!customer.phone_e164) {
    return {
      customerId: customer.id,
      phoneE164: "",
      messageBody: "",
      result: "skipped",
      sentAt: now,
      errorCode: "NO_PHONE",
      errorMessage: "This customer has no usable phone number.",
    };
  }

  try {
    return {
      body: renderMessage(context.template, customer, { storeName: context.storeName }),
      phone: customer.phone_e164,
    };
  } catch (error) {
    return {
      customerId: customer.id,
      phoneE164: customer.phone_e164,
      messageBody: context.template,
      result: "failed",
      sentAt: now,
      errorCode: error instanceof TemplateVariableError ? "TEMPLATE_ERROR" : "RENDER_ERROR",
      errorMessage: errorMessageOf(error),
    };
  }
}

function isRecord(value: { body: string; phone: string } | SmsSendRecord): value is SmsSendRecord {
  return "result" in value;
}

export async function executeRun(
  batch: readonly SmsCustomer[],
  context: SendRunContext,
  deps: SendRunDeps
): Promise<RunOutcome> {
  const results: SmsSendRecord[] = [];
  let haltedReason: HaltReason | null = null;

  for (const [index, customer] of batch.entries()) {
    if (deps.shouldAbort?.()) {
      haltedReason = "aborted";
      break;
    }

    if (index > 0) {
      await deps.wait(deps.staggerMs);
    }

    const prepared = prepare(customer, context, deps.now());

    let record: SmsSendRecord;
    if (isRecord(prepared)) {
      record = prepared;
    } else {
      try {
        await deps.sendSms(prepared.phone, prepared.body);
        record = {
          customerId: customer.id,
          phoneE164: prepared.phone,
          messageBody: prepared.body,
          result: "sent",
          sentAt: deps.now(),
        };
      } catch (error) {
        const errorCode = errorCodeOf(error);
        record = {
          customerId: customer.id,
          phoneE164: prepared.phone,
          messageBody: prepared.body,
          result: "failed",
          sentAt: deps.now(),
          errorCode,
          errorMessage: errorMessageOf(error),
        };
        if (errorCode === RATE_LIMIT_CODE) haltedReason = "rate_limited";
      }
    }

    results.push(record);

    try {
      await deps.recordSend(record);
    } catch {
      haltedReason = "log_failed";
      break;
    }

    if (haltedReason) break;
  }

  return {
    results,
    sentCount: results.filter((r) => r.result === "sent").length,
    failedCount: results.filter((r) => r.result === "failed").length,
    skippedCount: results.filter((r) => r.result === "skipped").length,
    haltedReason,
  };
}
