import { useCallback, useEffect, useRef, useState } from "react";
import { requestRecordingPermissionsAsync, setAudioModeAsync } from "expo-audio";
import { transcribeVoiceNote } from "./voice";

/**
 * The Owl composer's voice note: ask for the mic, hand off to the recording
 * bar (which owns the native recorder, so nothing is constructed until the
 * owner taps — see the post-login expo-audio crash), then turn the file into
 * text. The recorder itself lives in VoiceRecordingBar.
 */

export type VoiceNoteState = "idle" | "recording" | "transcribing";

export const MIC_DENIED_ERROR = "Allow microphone access in Settings to talk to Owl.";
export const MIC_FAILED_ERROR = "Couldn’t start the microphone. Please type instead.";
const TRANSCRIBE_FAILED_ERROR = "Couldn’t turn that into text. Please try again.";

/** iOS routes playback to the earpiece while recording is allowed: always give it back. */
function releaseRecordingMode() {
  setAudioModeAsync({ allowsRecording: false }).catch(() => {});
}

export function useVoiceNote(tenantId: string, onTranscript: (text: string) => void) {
  const [state, setState] = useState<VoiceNoteState>("idle");
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef<VoiceNoteState>("idle");
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        setError(MIC_DENIED_ERROR);
        return;
      }
      await setAudioModeAsync({ allowsRecording: true });
      setState("recording");
    } catch {
      releaseRecordingMode();
      setError(MIC_FAILED_ERROR);
    }
  }, []);

  /** Called by the recording bar: a file to transcribe, or null when cancelled / failed. */
  const finish = useCallback(
    async (uri: string | null, failure?: string) => {
      releaseRecordingMode();
      if (!uri) {
        setState("idle");
        if (failure) setError(failure);
        return;
      }
      setState("transcribing");
      try {
        onTranscriptRef.current(await transcribeVoiceNote(tenantId, uri));
      } catch (transcribeError) {
        setError(transcribeError instanceof Error ? transcribeError.message : TRANSCRIBE_FAILED_ERROR);
      } finally {
        setState("idle");
      }
    },
    [tenantId],
  );

  /** Closing the panel mid-recording: unmounting the bar stops the recorder. */
  const cancel = useCallback(() => {
    if (stateRef.current !== "recording") return;
    releaseRecordingMode();
    setState("idle");
  }, []);

  return { state, error, start, finish, cancel, clearError: () => setError(null) };
}
