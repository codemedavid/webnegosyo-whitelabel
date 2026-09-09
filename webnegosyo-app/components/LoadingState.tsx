import React from "react";
import { MascotLoader, type MascotSurface } from "./MascotLoader";

interface LoadingStateProps {
  message?: string;
  fullScreen?: boolean;
  /** Pass `card` when the loader sits on a white card or footer. */
  surface?: MascotSurface;
}

/**
 * Every wait is the mascot with its progress bar: full size on a screen of
 * its own, compact when it sits inside a screen that is otherwise drawn.
 */
export function LoadingState({
  message = "Loading...",
  fullScreen = false,
  surface = "background",
}: LoadingStateProps) {
  return (
    <MascotLoader
      fullScreen={fullScreen}
      size={fullScreen ? "full" : "compact"}
      surface={surface}
      message={message}
    />
  );
}
