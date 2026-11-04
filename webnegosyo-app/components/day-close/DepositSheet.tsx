import React, { useState } from "react";

import type { DayDeposit } from "../cash/deposit";
import { DepositBody } from "../cash/DepositBody";
import { DrawerSheet } from "../drawer/DrawerSheet";

export type DepositResult = { ok: true } | { ok: false; error: string };

interface DepositSheetProps {
  cashToDepositCents: number;
  isOffline: boolean;
  /** Pick and upload the slip photo; resolves to its url, null when cancelled. Throws on a failed upload. */
  onPickPhoto: () => Promise<string | null>;
  onSave: (deposit: DayDeposit, proofUrl: string | null) => Promise<DepositResult>;
  onClose: () => void;
}

/**
 * The day's deposit (06 §4.5 step 4): shared's DepositBody (Bank / Kept in
 * safe / Split, the gap against cash to deposit) in a sheet, with the slip
 * photo uploaded through the app's existing image upload. Set once — the
 * server refuses a second deposit on the same close.
 */
export function DepositSheet({ cashToDepositCents, isOffline, onPickPhoto, onSave, onClose }: DepositSheetProps) {
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setBusy] = useState(false);

  const addPhoto = async () => {
    setBusy(true);
    setError(null);
    try {
      const url = await onPickPhoto();
      if (url) setProofUrl(url);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The photo could not be added.");
    } finally {
      setBusy(false);
    }
  };

  const save = async (deposit: DayDeposit) => {
    setBusy(true);
    setError(null);
    const result = await onSave(deposit, proofUrl);
    setBusy(false);
    if (!result.ok) setError(result.error);
  };

  return (
    <DrawerSheet visible title="Record the deposit" subtitle="Where the day's cash went" onClose={onClose} isBusy={isBusy}>
      <DepositBody
        cashToDepositCents={cashToDepositCents}
        onSubmit={(deposit) => void save(deposit)}
        onAddPhoto={() => void addPhoto()}
        photoLabel={proofUrl ? "Photo added" : null}
        isOffline={isOffline}
        isBusy={isBusy}
        error={error}
      />
    </DrawerSheet>
  );
}
