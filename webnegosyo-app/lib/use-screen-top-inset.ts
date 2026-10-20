import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "../stores/auth-store";
import { isImpersonating } from "./impersonation";
import { screenTopInset } from "./screen-top-inset";

/** The notch clearance for a merchant screen; see `screenTopInset`. */
export function useScreenTopInset(): number {
  const { top } = useSafeAreaInsets();
  const isBannerAbove = useAuthStore((s) => isImpersonating(s));
  return screenTopInset(top, isBannerAbove);
}
