import { useCallback, useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RecordingPresets, useAudioRecorder, useAudioRecorderState, type RecordingOptions } from "expo-audio";
import { Icon } from "../Icon";
import { colors } from "../../theme/colors";
import { formatVoiceClock, MAX_VOICE_SECONDS } from "../../lib/assistant/voice";
import { MIC_FAILED_ERROR } from "../../lib/assistant/use-voice-note";

/**
 * Mono AAC in an mp4 container on BOTH platforms. Expo's LOW_QUALITY preset
 * records 3gp/AMR on Android, which Whisper refuses. 16 kHz is what Whisper
 * resamples to anyway, so a minute of speech stays around 350 KB.
 */
const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 16_000,
  numberOfChannels: 1,
  bitRate: 48_000,
};

const CLOCK_INTERVAL_MS = 250;

type Props = {
  /** A file to transcribe, or null when cancelled or the mic failed (with why). */
  onFinish: (uri: string | null, failure?: string) => void;
};

/**
 * The composer while the owner is talking. Mounted only after the mic tap, so
 * the native recorder is never built during the post-login navigation mount
 * (constructing expo-audio objects there crashed iOS once). Unmounting it —
 * the panel closing — stops the recorder and releases the mic.
 */
export function VoiceRecordingBar({ onFinish }: Props) {
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const { durationMillis } = useAudioRecorderState(recorder, CLOCK_INTERVAL_MS);
  const isFinishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const finish = useCallback(
    async (shouldKeep: boolean) => {
      if (isFinishedRef.current) return;
      isFinishedRef.current = true;
      try {
        await recorder.stop();
      } catch {
        onFinishRef.current(null, shouldKeep ? MIC_FAILED_ERROR : undefined);
        return;
      }
      onFinishRef.current(shouldKeep ? recorder.uri : null);
    },
    [recorder],
  );

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        await recorder.prepareToRecordAsync();
        // Done / Cancel tapped while the recorder was still preparing: never start it.
        if (isMounted && !isFinishedRef.current) recorder.record();
      } catch {
        if (!isMounted) return;
        isFinishedRef.current = true;
        onFinishRef.current(null, MIC_FAILED_ERROR);
      }
    })();
    return () => {
      isMounted = false;
      if (isFinishedRef.current) return;
      isFinishedRef.current = true;
      try {
        void recorder.stop().catch(() => {});
      } catch {
        // Already released with the component: the native side stopped it.
      }
    };
  }, [recorder]);

  useEffect(() => {
    if (durationMillis >= MAX_VOICE_SECONDS * 1000) void finish(true);
  }, [durationMillis, finish]);

  return (
    <View style={styles.row}>
      <View style={styles.bar} accessibilityRole="text" accessibilityLiveRegion="polite">
        <View style={styles.dot} />
        <Text style={styles.label}>Listening… {formatVoiceClock(durationMillis)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel recording" hitSlop={8} onPress={() => void finish(false)} style={styles.cancel}>
          <Icon name="close" size={18} color={colors.danger} />
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Done talking" onPress={() => void finish(true)} style={styles.done}>
        <Icon name="check" size={20} color={colors.textOnDark} strokeWidth={2.25} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  bar: { flex: 1, minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.dangerLight, borderRadius: 20, paddingLeft: 14, paddingRight: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  label: { flex: 1, fontSize: 15, color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  cancel: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  done: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" },
});
