import React from "react";

import { SegmentedControl } from "../SegmentedControl";

/** Count by denomination, or type one total (for a cashier who counted on paper). */
export type CountMode = "bills" | "total";

const OPTIONS: readonly { label: string; value: CountMode }[] = [
  { label: "Count bills", value: "bills" },
  { label: "Type total", value: "total" },
];

interface CountModeSwitchProps {
  value: CountMode;
  onChange: (mode: CountMode) => void;
}

/** "Count bills | Type total" at the top of a count (the default comes from the store rule). */
export function CountModeSwitch({ value, onChange }: CountModeSwitchProps) {
  return <SegmentedControl options={OPTIONS} value={value} onChange={onChange} accessibilityPrefix="Count by" />;
}
