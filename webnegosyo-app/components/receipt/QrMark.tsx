import React, { useMemo } from "react";
import Svg, { Path } from "react-native-svg";
import qrcode from "qrcode-generator";

/**
 * A QR code drawn as one SVG path, for the editor's paper preview.
 *
 * Built with the same generator the printer's raster fallback uses
 * (`lib/receipt-qr.ts`), so the square on screen has the same module count as
 * the one on paper. One path of unit squares rather than a rect per module:
 * a v6 code is ~800 dark modules, and 800 native views would make every
 * keystroke in the inspector re-lay out the paper.
 */
interface QrMarkProps {
  data: string;
  size: number;
  color: string;
}

/** Modules of white around the code. Two, not the spec's four: the paper around it is white too. */
const QUIET_ZONE = 2;

function modulePath(data: string): { d: string; count: number } {
  const qr = qrcode(0, "M");
  qr.addData(data);
  qr.make();
  const count = qr.getModuleCount();
  const parts: string[] = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) parts.push(`M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`);
    }
  }
  return { d: parts.join(""), count };
}

export function QrMark({ data, size, color }: QrMarkProps) {
  const { d, count } = useMemo(() => modulePath(data), [data]);
  const box = count + QUIET_ZONE * 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${box} ${box}`} accessibilityLabel="Tracking QR code">
      <Path d={d} fill={color} />
    </Svg>
  );
}
