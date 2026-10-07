/**
 * The Owl's voice note: no mic without permission, the transcript reaches the
 * composer, and recording mode is always handed back (iOS plays through the
 * earpiece while it is on — the order ringtone would go quiet).
 */
import { act, renderHook } from "@testing-library/react-native";

const mockPermission = jest.fn();
const mockSetAudioMode = jest.fn();
jest.mock("expo-audio", () => ({
  requestRecordingPermissionsAsync: () => mockPermission(),
  setAudioModeAsync: (mode: unknown) => mockSetAudioMode(mode),
}));

const mockTranscribe = jest.fn();
jest.mock("./voice", () => ({ transcribeVoiceNote: (...args: unknown[]) => mockTranscribe(...args) }));

import { MIC_DENIED_ERROR, MIC_FAILED_ERROR, useVoiceNote } from "./use-voice-note";

const TENANT = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mockPermission.mockReset().mockResolvedValue({ granted: true });
  mockSetAudioMode.mockReset().mockResolvedValue(undefined);
  mockTranscribe.mockReset();
});

test("a granted mic starts recording", async () => {
  const { result } = renderHook(() => useVoiceNote(TENANT, jest.fn()));

  await act(() => result.current.start());

  expect(result.current.state).toBe("recording");
  expect(mockSetAudioMode).toHaveBeenCalledWith({ allowsRecording: true });
});

test("a denied mic explains where to allow it", async () => {
  mockPermission.mockResolvedValue({ granted: false });
  const { result } = renderHook(() => useVoiceNote(TENANT, jest.fn()));

  await act(() => result.current.start());

  expect(result.current.state).toBe("idle");
  expect(result.current.error).toBe(MIC_DENIED_ERROR);
});

test("a failing audio session reports and stays idle", async () => {
  mockSetAudioMode.mockRejectedValueOnce(new Error("session busy"));
  const { result } = renderHook(() => useVoiceNote(TENANT, jest.fn()));

  await act(() => result.current.start());

  expect(result.current.state).toBe("idle");
  expect(result.current.error).toBe(MIC_FAILED_ERROR);
});

test("a finished note is transcribed into the composer and recording mode is released", async () => {
  mockTranscribe.mockResolvedValue("Ilan ang orders ngayon?");
  const onTranscript = jest.fn();
  const { result } = renderHook(() => useVoiceNote(TENANT, onTranscript));
  await act(() => result.current.start());

  await act(() => result.current.finish("file:///rec.m4a"));

  expect(mockTranscribe).toHaveBeenCalledWith(TENANT, "file:///rec.m4a");
  expect(onTranscript).toHaveBeenCalledWith("Ilan ang orders ngayon?");
  expect(result.current.state).toBe("idle");
  expect(mockSetAudioMode).toHaveBeenLastCalledWith({ allowsRecording: false });
});

test("a refused transcription shows the reason", async () => {
  mockTranscribe.mockRejectedValue(new Error("Voice input isn’t set up yet. Please type your message."));
  const onTranscript = jest.fn();
  const { result } = renderHook(() => useVoiceNote(TENANT, onTranscript));
  await act(() => result.current.start());

  await act(() => result.current.finish("file:///rec.m4a"));

  expect(onTranscript).not.toHaveBeenCalled();
  expect(result.current.error).toMatch(/isn’t set up/);
});

test("a cancelled note sends nothing", async () => {
  const { result } = renderHook(() => useVoiceNote(TENANT, jest.fn()));
  await act(() => result.current.start());

  await act(() => result.current.finish(null));

  expect(mockTranscribe).not.toHaveBeenCalled();
  expect(result.current.state).toBe("idle");
  expect(mockSetAudioMode).toHaveBeenLastCalledWith({ allowsRecording: false });
});

test("closing the panel mid-recording releases recording mode", async () => {
  const { result } = renderHook(() => useVoiceNote(TENANT, jest.fn()));
  await act(() => result.current.start());

  act(() => result.current.cancel());

  expect(result.current.state).toBe("idle");
  expect(mockSetAudioMode).toHaveBeenLastCalledWith({ allowsRecording: false });
});

test("closing the panel while the mic prompt is up never starts recording", async () => {
  let grant: (value: { granted: boolean }) => void = () => {};
  mockPermission.mockReturnValue(new Promise((resolve) => (grant = resolve)));
  const { result } = renderHook(() => useVoiceNote(TENANT, jest.fn()));

  let starting: Promise<void> = Promise.resolve();
  act(() => {
    starting = result.current.start();
  });
  act(() => result.current.cancel());
  await act(async () => {
    grant({ granted: true });
    await starting;
  });

  expect(result.current.state).toBe("idle");
  expect(mockSetAudioMode).not.toHaveBeenCalledWith({ allowsRecording: true });
});
