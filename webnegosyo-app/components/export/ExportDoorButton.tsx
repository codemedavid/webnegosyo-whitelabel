import React from "react";
import { router } from "expo-router";

import { exportHref, type ExportStart } from "../../lib/export/export-routes";
import { useCanOpenExport } from "../../lib/export/use-can-open-export";
import { IconButton } from "../IconButton";

interface ExportDoorButtonProps {
  /** The sheets this screen's figures live in; ones the account may not have are simply not ticked. */
  sheets: readonly string[];
  /** The dates on screen; absent = today. */
  start?: ExportStart;
  label?: string;
}

/**
 * A report screen's Export button: opens the Export screen with this screen's
 * sheets and dates already chosen. Draws nothing for an account or store that
 * has no Export screen.
 */
export function ExportDoorButton({ sheets, start, label = "Export these figures" }: ExportDoorButtonProps) {
  const canOpen = useCanOpenExport();
  if (!canOpen) return null;
  return <IconButton icon="export" label={label} onPress={() => router.push(exportHref(sheets, start) as never)} testID="export-door-button" />;
}
