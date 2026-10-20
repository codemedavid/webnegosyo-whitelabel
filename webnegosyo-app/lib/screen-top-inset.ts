/**
 * How much a merchant screen pads its top to clear the notch.
 *
 * The impersonation banner is mounted above the tabs and clears the notch
 * itself, so a screen under it that pads the device inset again draws an empty
 * band above its title — almost a tenth of a small phone.
 */
export function screenTopInset(deviceTopInset: number, isBannerAbove: boolean): number {
  return isBannerAbove ? 0 : deviceTopInset;
}
