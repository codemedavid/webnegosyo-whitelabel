/**
 * One download for every screen query that asks the same question at once.
 *
 * The Analytics screen mounts nine queries over ONE window, and five of them
 * need the same orders. Read separately, a busy store's phone downloaded that
 * window five times over, side by side, and each copy queued behind the others
 * until the 12 s deadline failed them all (Gungjeon, 2026-10-22). Here a read
 * that is already on the wire is joined instead of started again.
 *
 * Only reads IN FLIGHT are shared — a settled read is forgotten at once, so a
 * refresh always downloads fresh rows; the query cache already keeps answers.
 *
 * Cancellation is per caller. A caller whose query is cancelled (or times out)
 * stops waiting at once; the download itself is aborted only when no caller is
 * left waiting for it.
 */

interface InFlight {
  promise: Promise<unknown>;
  controller: AbortController;
  waiting: number;
}

const inFlight = new Map<string, InFlight>();

function abortError(): Error {
  const error = new Error("The read was cancelled.");
  error.name = "AbortError";
  return error;
}

function start(key: string, read: (signal: AbortSignal) => Promise<unknown>): InFlight {
  const controller = new AbortController();
  const entry: InFlight = { promise: Promise.resolve(), controller, waiting: 0 };
  entry.promise = read(controller.signal).finally(() => {
    if (inFlight.get(key) === entry) inFlight.delete(key);
  });
  // Joined callers each handle the outcome; this keeps an abandoned read quiet.
  entry.promise.catch(() => undefined);
  inFlight.set(key, entry);
  return entry;
}

/**
 * The result of `read`, shared with every other caller that asks for `key`
 * while it is still running. `key` must name everything that decides the rows
 * (tenant, branch, window, columns).
 */
export function sharedRead<T>(
  key: string,
  callerSignal: AbortSignal | undefined,
  read: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  if (callerSignal?.aborted) return Promise.reject(abortError());

  const entry = inFlight.get(key) ?? start(key, read);
  entry.waiting += 1;
  if (!callerSignal) return entry.promise as Promise<T>;

  return new Promise<T>((resolve, reject) => {
    const leave = () => {
      entry.waiting -= 1;
      if (entry.waiting === 0 && inFlight.get(key) === entry) {
        inFlight.delete(key);
        entry.controller.abort();
      }
      reject(abortError());
    };
    callerSignal.addEventListener("abort", leave, { once: true });
    entry.promise.then(
      (value) => {
        callerSignal.removeEventListener("abort", leave);
        resolve(value as T);
      },
      (error: unknown) => {
        callerSignal.removeEventListener("abort", leave);
        reject(error);
      }
    );
  });
}

/** Reads currently on the wire — for tests. */
export function sharedReadsInFlight(): number {
  return inFlight.size;
}
