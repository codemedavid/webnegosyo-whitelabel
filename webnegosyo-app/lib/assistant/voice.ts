/**
 * Talk to the Owl: a recorded voice note is posted to the web app's
 * /api/assistant/transcribe (Whisper) and the text comes back for the
 * composer. The owner always reviews the transcript before sending it.
 */

import { getWebAppUrl } from "../web-app-url";
import { assistantToken, AssistantRequestError } from "./api";
import { MAX_INPUT_CHARS, readRefusal } from "./presentation";

/** Longest note before recording stops on its own (web: src/lib/assistant/limits.ts). */
export const MAX_VOICE_SECONDS = 60;
/** Upload + Whisper; a minute of speech transcribes in a few seconds. */
const TRANSCRIBE_TIMEOUT_MS = 45_000;

const UNREACHABLE_ERROR = "Could not reach the server. Check your connection and try again.";

/** React Native's multipart file part. Whisper reads the container from the name. */
export interface VoiceUploadPart {
  uri: string;
  name: string;
  type: string;
}

export function voiceUploadPart(uri: string): VoiceUploadPart {
  // The recorder always writes AAC in an mp4 container (see VOICE_RECORDING_OPTIONS).
  return { uri, name: "voice.m4a", type: "audio/mp4" };
}

export function formatVoiceClock(durationMillis: number): string {
  const seconds = Math.floor(durationMillis / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** A transcript joins whatever is already typed. */
export function joinTranscript(draft: string, transcript: string): string {
  return draft.trim() ? `${draft.trimEnd()} ${transcript}` : transcript;
}

export async function transcribeVoiceNote(tenantId: string, uri: string): Promise<string> {
  const token = await assistantToken();
  const form = new FormData();
  form.append("tenantId", tenantId);
  // RN's FormData streams the file from `uri`; the DOM typing doesn't know that shape.
  form.append("audio", voiceUploadPart(uri) as unknown as Blob);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);
  try {
    const response = await fetch(`${getWebAppUrl()}/api/assistant/transcribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: controller.signal,
    });
    const body: unknown = await response.json().catch(() => ({}));
    const text = (body as { text?: unknown }).text;
    if (!response.ok || typeof text !== "string") throw new AssistantRequestError(readRefusal(body, response.status));
    return text.slice(0, MAX_INPUT_CHARS);
  } catch (error) {
    if (error instanceof AssistantRequestError) throw error;
    throw new AssistantRequestError(UNREACHABLE_ERROR);
  } finally {
    clearTimeout(timer);
  }
}
