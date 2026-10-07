import { Modal as NativeModal, type ModalProps } from "react-native";

/**
 * Every orientation the app can be in. React Native's `<Modal>` defaults to
 * `["portrait"]` on iOS, and tablets are hard-locked landscape
 * (`UISupportedInterfaceOrientations~ipad` in app.config.ts) — so a default
 * modal asks UIKit for an orientation the app refuses, which is a red box in
 * dev and a CRASH in release. A modal must never narrow the app's own lock;
 * the Info.plist / runtime lock is the single decision.
 */
export const MODAL_ORIENTATIONS: NonNullable<ModalProps["supportedOrientations"]> = [
  "portrait",
  "portrait-upside-down",
  "landscape",
  "landscape-left",
  "landscape-right",
];

/** Drop-in for react-native's `Modal`. Import this one, never the native one. */
export function Modal({ supportedOrientations = MODAL_ORIENTATIONS, ...props }: ModalProps) {
  return <NativeModal supportedOrientations={supportedOrientations} {...props} />;
}
