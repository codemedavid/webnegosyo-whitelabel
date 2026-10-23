import { sharedRead, sharedReadsInFlight } from "./shared-read";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("sharedRead", () => {
  it("runs one read for every caller that asks while it is on the wire", async () => {
    // Arrange
    const download = deferred<string[]>();
    const read = jest.fn(() => download.promise);

    // Act
    const first = sharedRead("orders|t1|30d", undefined, read);
    const second = sharedRead("orders|t1|30d", undefined, read);
    download.resolve(["o1"]);

    // Assert
    await expect(first).resolves.toEqual(["o1"]);
    await expect(second).resolves.toEqual(["o1"]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("forgets a settled read, so the next ask downloads fresh rows", async () => {
    // Arrange
    const read = jest.fn(async () => ["o1"]);

    // Act
    await sharedRead("k", undefined, read);
    await sharedRead("k", undefined, read);

    // Assert
    expect(read).toHaveBeenCalledTimes(2);
    expect(sharedReadsInFlight()).toBe(0);
  });

  it("keeps different questions apart", async () => {
    // Arrange
    const read = jest.fn(async () => []);

    // Act
    await Promise.all([sharedRead("a", undefined, read), sharedRead("b", undefined, read)]);

    // Assert
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("lets one caller give up without cancelling the read the others wait for", async () => {
    // Arrange
    const download = deferred<string>();
    let readSignal: AbortSignal | undefined;
    const read = (signal: AbortSignal) => {
      readSignal = signal;
      return download.promise;
    };
    const quitter = new AbortController();
    const stayer = new AbortController();

    // Act
    const abandoned = sharedRead("k", quitter.signal, read);
    const kept = sharedRead("k", stayer.signal, read);
    quitter.abort();
    download.resolve("rows");

    // Assert
    await expect(abandoned).rejects.toMatchObject({ name: "AbortError" });
    await expect(kept).resolves.toBe("rows");
    expect(readSignal?.aborted).toBe(false);
  });

  it("aborts the download once nobody is waiting for it", async () => {
    // Arrange
    const download = deferred<string>();
    let readSignal: AbortSignal | undefined;
    const read = (signal: AbortSignal) => {
      readSignal = signal;
      return download.promise;
    };
    const one = new AbortController();
    const two = new AbortController();
    const first = sharedRead("k", one.signal, read);
    const second = sharedRead("k", two.signal, read);

    // Act
    one.abort();
    two.abort();

    // Assert
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(second).rejects.toMatchObject({ name: "AbortError" });
    expect(readSignal?.aborted).toBe(true);
    expect(sharedReadsInFlight()).toBe(0);
  });

  it("starts a fresh read after an abandoned one rather than joining it", async () => {
    // Arrange
    const read = jest.fn(() => new Promise<string>(() => undefined));
    const gone = new AbortController();
    const first = sharedRead("k", gone.signal, read);
    gone.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });

    // Act
    void sharedRead("k", new AbortController().signal, read);

    // Assert
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("hands every caller the read's failure", async () => {
    // Arrange
    const download = deferred<string>();
    const read = () => download.promise;

    // Act
    const first = sharedRead("failing", new AbortController().signal, read);
    const second = sharedRead("failing", undefined, read);
    download.reject(new Error("permission denied"));

    // Assert
    await expect(first).rejects.toThrow("permission denied");
    await expect(second).rejects.toThrow("permission denied");
  });

  it("refuses at once for a caller that was already cancelled", async () => {
    // Arrange
    const read = jest.fn(async () => "rows");
    const gone = new AbortController();
    gone.abort();

    // Act / Assert
    await expect(sharedRead("failing", gone.signal, read)).rejects.toMatchObject({ name: "AbortError" });
    expect(read).not.toHaveBeenCalled();
  });
});
