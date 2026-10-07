/**
 * The composer while talking: recording starts on mount, Done hands back the
 * file, Cancel hands back nothing, and a minute stops it on its own.
 */
import { act, fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("../../lib/authorized-post", () => ({ getAccessTokenBounded: async () => "user-token" }));
jest.mock("../../lib/web-app-url", () => ({ getWebAppUrl: () => "https://web.test" }));

import { VoiceRecordingBar } from "./VoiceRecordingBar";

const audio = jest.requireMock("expo-audio") as {
  useAudioRecorder: jest.Mock;
  useAudioRecorderState: jest.Mock;
};

function fakeRecorder() {
  return { prepareToRecordAsync: jest.fn(async () => {}), record: jest.fn(), stop: jest.fn(async () => {}), uri: "file:///cache/rec.m4a" };
}

let recorder: ReturnType<typeof fakeRecorder>;

beforeEach(() => {
  recorder = fakeRecorder();
  audio.useAudioRecorder.mockReturnValue(recorder);
  audio.useAudioRecorderState.mockReturnValue({ durationMillis: 7_000, isRecording: true });
});

test("starts recording and shows the clock", async () => {
  render(<VoiceRecordingBar onFinish={jest.fn()} />);
  await act(async () => {});

  expect(recorder.prepareToRecordAsync).toHaveBeenCalled();
  expect(recorder.record).toHaveBeenCalled();
  expect(screen.getByText("Listening… 0:07")).toBeTruthy();
});

test("Done hands back the recorded file once", async () => {
  const onFinish = jest.fn();
  render(<VoiceRecordingBar onFinish={onFinish} />);
  await act(async () => {});

  await act(async () => {
    fireEvent.press(screen.getByLabelText("Done talking"));
    fireEvent.press(screen.getByLabelText("Done talking"));
  });

  expect(recorder.stop).toHaveBeenCalledTimes(1);
  expect(onFinish).toHaveBeenCalledTimes(1);
  expect(onFinish).toHaveBeenCalledWith("file:///cache/rec.m4a");
});

test("Cancel stops without a file", async () => {
  const onFinish = jest.fn();
  render(<VoiceRecordingBar onFinish={onFinish} />);
  await act(async () => {});

  await act(async () => fireEvent.press(screen.getByLabelText("Cancel recording")));

  expect(recorder.stop).toHaveBeenCalled();
  expect(onFinish).toHaveBeenCalledWith(null);
});

test("stops on its own at the time limit", async () => {
  audio.useAudioRecorderState.mockReturnValue({ durationMillis: 60_000, isRecording: true });
  const onFinish = jest.fn();

  render(<VoiceRecordingBar onFinish={onFinish} />);
  await act(async () => {});

  expect(onFinish).toHaveBeenCalledWith("file:///cache/rec.m4a");
});

test("a mic that fails to start reports instead of hanging", async () => {
  recorder.prepareToRecordAsync.mockRejectedValue(new Error("busy"));
  const onFinish = jest.fn();

  render(<VoiceRecordingBar onFinish={onFinish} />);
  await act(async () => {});

  expect(onFinish).toHaveBeenCalledWith(null, expect.stringMatching(/microphone/));
});

test("unmounting mid-recording stops the recorder", async () => {
  const { unmount } = render(<VoiceRecordingBar onFinish={jest.fn()} />);
  await act(async () => {});

  unmount();

  expect(recorder.stop).toHaveBeenCalled();
});

test("Cancel tapped while the recorder is still preparing never starts it", async () => {
  let ready: () => void = () => {};
  recorder.prepareToRecordAsync.mockReturnValue(new Promise<void>((resolve) => (ready = resolve)));
  const onFinish = jest.fn();
  render(<VoiceRecordingBar onFinish={onFinish} />);

  await act(async () => fireEvent.press(screen.getByLabelText("Cancel recording")));
  await act(async () => ready());

  expect(recorder.record).not.toHaveBeenCalled();
  expect(onFinish).toHaveBeenCalledWith(null);
});
