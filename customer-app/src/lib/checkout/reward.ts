/**
 * The prototype's estimate of a "free item" reward: the dearest single unit in
 * the bag. The server decides what a reward really covers when the order is placed.
 */
export function rewardEstimateCentavos(lines: readonly { unitCentavos: number }[]): number {
  return lines.reduce((max, line) => Math.max(max, line.unitCentavos), 0)
}
