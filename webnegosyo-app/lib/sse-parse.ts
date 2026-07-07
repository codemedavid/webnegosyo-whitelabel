// Pure incremental parser for OpenRouter's Server-Sent Events stream. The
// growth-coach edge function relays OpenRouter's `data: {json}` lines verbatim;
// this pulls the assistant's text deltas out of them. Kept pure and buffered so
// a chunk boundary that splits a line mid-JSON doesn't drop a token — the caller
// threads `rest` back in on the next chunk. No React, no fetch — unit-testable.

export interface SseParseResult {
  /** Text deltas decoded from the complete lines in this buffer. */
  deltas: string[];
  /** Trailing partial line to prepend to the next chunk (may be ""). */
  rest: string;
}

/**
 * Parse the accumulated SSE `buffer`, returning the content deltas from every
 * COMPLETE line and the leftover partial line. Non-data lines, `[DONE]`, and
 * unparseable JSON are skipped defensively rather than throwing.
 */
export function parseSseChunk(buffer: string): SseParseResult {
  const newlineIndex = buffer.lastIndexOf("\n");
  if (newlineIndex === -1) {
    // No complete line yet — hold everything for the next chunk.
    return { deltas: [], rest: buffer };
  }

  const complete = buffer.slice(0, newlineIndex);
  const rest = buffer.slice(newlineIndex + 1);
  const deltas: string[] = [];

  for (const rawLine of complete.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) continue;

    const data = line.slice(5).trim();
    if (data === "" || data === "[DONE]") continue;

    try {
      const parsed = JSON.parse(data);
      const content = parsed?.choices?.[0]?.delta?.content;
      if (typeof content === "string" && content.length > 0) {
        deltas.push(content);
      }
    } catch {
      // Partial/garbled JSON — skip; the stream self-corrects on later lines.
    }
  }

  return { deltas, rest };
}
