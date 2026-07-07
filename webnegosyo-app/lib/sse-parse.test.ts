import { parseSseChunk } from "./sse-parse";

function dataLine(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n`;
}

describe("parseSseChunk", () => {
  it("extracts a content delta from a single complete data line", () => {
    const { deltas, rest } = parseSseChunk(dataLine("Hello"));
    expect(deltas).toEqual(["Hello"]);
    expect(rest).toBe("");
  });

  it("extracts deltas from multiple complete lines in order", () => {
    const buffer = dataLine("Raise ") + dataLine("your ") + dataLine("prices.");
    const { deltas } = parseSseChunk(buffer);
    expect(deltas).toEqual(["Raise ", "your ", "prices."]);
  });

  it("holds a trailing partial line as rest instead of dropping it", () => {
    const buffer = dataLine("done") + 'data: {"choices":[{"delta":{"content":"par';
    const { deltas, rest } = parseSseChunk(buffer);
    expect(deltas).toEqual(["done"]);
    expect(rest).toBe('data: {"choices":[{"delta":{"content":"par');
  });

  it("recombines a split line across two chunks without losing the token", () => {
    const first = parseSseChunk('data: {"choices":[{"delta":{"content":"Sell ');
    expect(first.deltas).toEqual([]);

    const second = parseSseChunk(first.rest + 'more"}}]}\n');
    expect(second.deltas).toEqual(["Sell more"]);
    expect(second.rest).toBe("");
  });

  it("ignores the [DONE] sentinel and non-data lines", () => {
    const buffer =
      dataLine("Go") + ": openrouter comment\n" + "\n" + "data: [DONE]\n";
    const { deltas } = parseSseChunk(buffer);
    expect(deltas).toEqual(["Go"]);
  });

  it("skips unparseable JSON without throwing", () => {
    const buffer = "data: {not json}\n" + dataLine("safe");
    expect(() => parseSseChunk(buffer)).not.toThrow();
    expect(parseSseChunk(buffer).deltas).toEqual(["safe"]);
  });

  it("returns everything as rest when there is no complete line yet", () => {
    const { deltas, rest } = parseSseChunk("data: partial");
    expect(deltas).toEqual([]);
    expect(rest).toBe("data: partial");
  });

  it("ignores keep-alive lines with empty content deltas", () => {
    const buffer = `data: ${JSON.stringify({ choices: [{ delta: {} }] })}\n`;
    const { deltas } = parseSseChunk(buffer);
    expect(deltas).toEqual([]);
  });
});
