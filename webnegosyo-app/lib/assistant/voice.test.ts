/**
 * Uploading a voice note: the recorded file goes as multipart with the user's
 * bearer token, the transcript comes back, and every refusal reads as the
 * server's own words.
 */
jest.mock("../authorized-post", () => ({ getAccessTokenBounded: async () => "user-token" }));
jest.mock("../web-app-url", () => ({ getWebAppUrl: () => "https://web.test" }));

import { formatVoiceClock, joinTranscript, transcribeVoiceNote, voiceUploadPart } from "./voice";

const TENANT = "11111111-1111-4111-8111-111111111111";
const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("voiceUploadPart", () => {
  test("labels an m4a recording as AAC in an mp4 container", () => {
    expect(voiceUploadPart("file:///cache/rec-1.m4a")).toEqual({ uri: "file:///cache/rec-1.m4a", name: "voice.m4a", type: "audio/mp4" });
  });

  test("falls back to m4a when the uri has no extension", () => {
    expect(voiceUploadPart("file:///cache/rec")).toMatchObject({ name: "voice.m4a" });
  });
});

describe("transcribeVoiceNote", () => {
  test("posts the clip with the bearer token and returns the text", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ text: "Ano best seller ko?" }) });

    const text = await transcribeVoiceNote(TENANT, "file:///cache/rec.m4a");

    expect(text).toBe("Ano best seller ko?");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://web.test/api/assistant/transcribe");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer user-token");
    expect((init.body as FormData).get("tenantId")).toBe(TENANT);
  });

  test("throws the server's refusal", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: "Voice input isn’t set up yet. Please type your message." }) });

    await expect(transcribeVoiceNote(TENANT, "file:///cache/rec.m4a")).rejects.toThrow("Voice input isn’t set up yet. Please type your message.");
  });

  test("explains an unreachable server", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));

    await expect(transcribeVoiceNote(TENANT, "file:///cache/rec.m4a")).rejects.toThrow(/connection/);
  });
});

describe("helpers", () => {
  test("formats the recording clock", () => {
    expect(formatVoiceClock(0)).toBe("0:00");
    expect(formatVoiceClock(7_400)).toBe("0:07");
    expect(formatVoiceClock(60_000)).toBe("1:00");
  });

  test("joins a transcript onto what was already typed", () => {
    expect(joinTranscript("", "Hello")).toBe("Hello");
    expect(joinTranscript("Sales today  ", "and yesterday")).toBe("Sales today and yesterday");
  });
});
