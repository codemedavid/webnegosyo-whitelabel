/**
 * Running a campaign from the screen.
 *
 * Everything decision-shaped lives in `lib/sms/`; this hook only assembles the
 * pieces and holds the React state the run screen renders. The assembly order
 * matters in one place — the transport is built lazily, inside `start`, rather
 * than at render. Constructing a native module during render is what caused the
 * post-login SIGABRT this app already shipped once, and a merchant on iOS must
 * be able to open this screen without touching the Android module at all.
 */

import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";
import { supabase } from "../lib/supabase";
import { SmsSenderModule } from "../modules/sms-sender";
import { executeRun } from "../lib/sms/send-run";
import { orchestrateRun } from "../lib/sms/run-orchestrator";
import { createSmsTransport } from "../lib/sms/transport";
import { androidSmsPermissions } from "../lib/sms/android-permissions";
import { getDeviceId } from "../lib/sms/device-id";
import {
  claimRun,
  finishRun,
  listSentCustomerIds,
  recordSend,
} from "../lib/sms/campaigns-repo";
import type { OrchestratedRun } from "../lib/sms/run-orchestrator";
import type { SmsNativeClient, SmsCustomer } from "../lib/sms/types";

/** Gap between messages. Keeps a run under Android's silent ~30/30min throttle. */
const STAGGER_MS = 2500;

export interface RunProgress {
  total: number;
  attempted: number;
}

export interface StartRunInput {
  tenantId: string;
  runId: string;
  template: string;
  storeName: string;
  maxPerRun: number;
  audience: readonly SmsCustomer[];
}

export interface UseSmsRun {
  isRunning: boolean;
  progress: RunProgress | null;
  result: OrchestratedRun | null;
  error: string | null;
  start: (input: StartRunInput) => Promise<void>;
  cancel: () => void;
}

export function useSmsRun(): UseSmsRun {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [result, setResult] = useState<OrchestratedRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A ref, not state: the send loop reads this between messages and must see
  // the latest value without waiting for a re-render.
  const cancelled = useRef(false);

  const cancel = useCallback(() => {
    cancelled.current = true;
  }, []);

  const start = useCallback(async (input: StartRunInput) => {
    cancelled.current = false;
    setError(null);
    setResult(null);
    setIsRunning(true);
    setProgress({ total: input.audience.length, attempted: 0 });

    try {
      // Lazy on purpose — see the module comment.
      const transport = createSmsTransport({
        platform: Platform.OS,
        native: SmsSenderModule as SmsNativeClient | null,
        permissions: androidSmsPermissions,
      });

      const deviceId = await getDeviceId();
      let attempted = 0;

      const outcome = await orchestrateRun(
        {
          runId: input.runId,
          deviceId,
          template: input.template,
          storeName: input.storeName,
          maxPerRun: input.maxPerRun,
          audience: input.audience,
        },
        {
          claimRun,
          listSentCustomerIds,
          finishRun,
          execute: (batch, template, storeName) =>
            executeRun(batch, { template, storeName }, {
              sendSms: (phone, body) => transport.send(phone, body),
              recordSend: async (record) => {
                await recordSend(input.tenantId, input.runId, record);
                attempted += 1;
                setProgress({ total: batch.length, attempted });
              },
              wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
              now: () => new Date().toISOString(),
              staggerMs: STAGGER_MS,
              shouldAbort: () => cancelled.current,
            }),
        }
      );

      setResult(outcome);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The run could not be started.");
    } finally {
      setIsRunning(false);
    }
  }, []);

  return { isRunning, progress, result, error, start, cancel };
}
