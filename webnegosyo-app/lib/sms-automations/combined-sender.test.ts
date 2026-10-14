import { createCombinedSender } from "./combined-sender";
import type { OutboxRunResult } from "./outbox-worker";

function setup(codeResults: string[], textResults: OutboxRunResult[]) {
  let clock = 0;
  const codes = { runOnce: jest.fn(async () => (codeResults.shift() ?? "idle") as never) };
  const texts = { runOnce: jest.fn(async () => textResults.shift() ?? ({ result: "waiting", reason: "no_job", retryAt: null } as const)) };
  const sender = createCombinedSender({ codes, texts, now: () => clock });
  return { sender, codes, texts, advance: (ms: number) => { clock += ms; } };
}

test("a waiting reward code always goes first", async () => {
  const { sender, texts } = setup(["sent"], [{ result: "sent" }]);
  expect(await sender.runOnce()).toBe("sent");
  expect(texts.runOnce).not.toHaveBeenCalled();
});

test("automated texts go out when no code is waiting, with a gap between them", async () => {
  const { sender, texts, advance } = setup([], [{ result: "sent" }, { result: "sent" }]);
  expect(await sender.runOnce()).toBe("sent");
  advance(5_000);
  expect(await sender.runOnce()).toBe("idle"); // inside the 15s gap: codes polled, texts not
  expect(texts.runOnce).toHaveBeenCalledTimes(1);
  advance(10_000);
  expect(await sender.runOnce()).toBe("sent");
});

test("nothing to send reads as idle and waits a minute before asking again", async () => {
  const { sender, texts, advance } = setup([], []);
  expect(await sender.runOnce()).toBe("idle");
  advance(30_000);
  await sender.runOnce();
  expect(texts.runOnce).toHaveBeenCalledTimes(1);
  advance(30_000);
  await sender.runOnce();
  expect(texts.runOnce).toHaveBeenCalledTimes(2);
});

test("trouble with texts is reported so the loop backs off", async () => {
  const { sender } = setup([], [{ result: "uncertain" }]);
  expect(await sender.runOnce()).toBe("uncertain");
});
