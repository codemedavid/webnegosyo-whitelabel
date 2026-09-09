/**
 * The spotlight once looped forever: storing a frame rebuilt the context,
 * which rebuilt the target's measure callback, which re-ran the effect whose
 * cleanup cleared the frame. This pins that a target measuring repeatedly
 * neither re-renders itself nor thrashes the overlay.
 */

import React from "react";
import { act, render } from "@testing-library/react-native";
import { View } from "react-native";
import { CoachTarget, SpotlightOverlay, SpotlightProvider } from "./spotlight";

describe("spotlight", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("stays settled while an active target keeps re-measuring", () => {
    const renders = jest.fn();
    const measureInWindow = jest.spyOn(View.prototype, "measureInWindow").mockImplementation(function (cb) {
      cb(10, 20, 100, 40);
    });
    function Probe() {
      renders();
      return (
        <CoachTarget active>
          <View />
        </CoachTarget>
      );
    }
    render(
      <SpotlightProvider>
        <Probe />
        <SpotlightOverlay visible />
      </SpotlightProvider>,
    );
    const before = renders.mock.calls.length;

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(renders.mock.calls.length).toBe(before);
    expect(measureInWindow).toHaveBeenCalled();
    measureInWindow.mockRestore();
  });
});
