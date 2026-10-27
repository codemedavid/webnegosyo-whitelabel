import React, { useState } from "react";

import type { Remittance } from "../../lib/cash/remittances";
import { AcceptRemitBody } from "../cash/AcceptRemitBody";
import { DrawerSheet } from "../drawer/DrawerSheet";

export type SheetResult = { ok: true } | { ok: false; error: string };

interface AcceptRemittanceSheetProps {
  remittance: Remittance;
  isOffline: boolean;
  onAccept: (receivedCents: number, note: string | null) => Promise<SheetResult>;
  onDispute: (reason: string, receivedCents: number | null) => Promise<SheetResult>;
  onClose: () => void;
}

const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

/**
 * The receiver's Accept sheet (06 §4.4): the one accept UI is shared's
 * AcceptRemitBody (Yes · different amount · something's wrong); this only
 * docks it in a sheet, runs the write, and keeps the sheet open on a refusal
 * with the server's words.
 */
export function AcceptRemittanceSheet({ remittance, isOffline, onAccept, onDispute, onClose }: AcceptRemittanceSheetProps) {
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setBusy] = useState(false);

  const run = async (work: () => Promise<SheetResult>) => {
    setBusy(true);
    setError(null);
    const result = await work();
    setBusy(false);
    if (!result.ok) setError(result.error);
  };

  return (
    <DrawerSheet
      visible
      title="Accept cash"
      subtitle={remittance.shift?.drawerName ?? remittance.cashierName}
      onClose={onClose}
      isBusy={isBusy}
    >
      <AcceptRemitBody
        cashierName={firstName(remittance.cashierName)}
        handedOverCents={remittance.handedOverCents}
        onAccept={({ receivedCents, note }) => void run(() => onAccept(receivedCents, note))}
        onDispute={({ reason }) => void run(() => onDispute(reason, null))}
        isOffline={isOffline}
        isBusy={isBusy}
        error={error}
      />
    </DrawerSheet>
  );
}
