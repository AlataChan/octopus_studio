const path = require("path");
const { isWithin } = require("../../../files");
const {
  shouldOffload,
  buildOffloadHandle,
  maybeOffloadResult,
} = require("../resultOffload");

describe("resultOffload", () => {
  const big = "x".repeat(60000);
  const small = "hello world";
  const storageDir = "/tmp/alata-test-storage";

  it("shouldOffload: true only above threshold", () => {
    expect(shouldOffload(big, { thresholdChars: 50000 })).toBe(true);
    expect(shouldOffload(small, { thresholdChars: 50000 })).toBe(false);
  });

  it("buildOffloadHandle: writes full content, returns confined path + preview text", () => {
    const writes = [];
    const handle = buildOffloadHandle({
      toolName: "web-scraping",
      result: big,
      runId: "../evil/run",
      storageDir,
      writeFile: (p, c) => writes.push([p, c]),
    });
    const storageRoot = path.join(storageDir, "tool-results");
    expect(isWithin(storageRoot, handle.path)).toBe(true);
    expect(handle.bytes).toBe(Buffer.byteLength(big));
    expect(handle.text).toContain("web-scraping");
    expect(handle.text.length).toBeLessThan(big.length);
    expect(writes).toHaveLength(1);
    expect(writes[0][1]).toBe(big);
  });

  it("maybeOffloadResult: passthrough when disabled or small", () => {
    const noop = () => {};
    expect(
      maybeOffloadResult("web-scraping", big, {
        enabled: false,
        runId: "r",
        storageDir,
        writeFile: noop,
      })
    ).toEqual({ result: big, offloaded: false });
    expect(
      maybeOffloadResult("web-scraping", small, {
        enabled: true,
        runId: "r",
        storageDir,
        writeFile: noop,
        thresholdChars: 50000,
      })
    ).toEqual({ result: small, offloaded: false });
  });

  it("maybeOffloadResult: offloads (string result) when enabled and large", () => {
    const noop = () => {};
    const out = maybeOffloadResult("web-scraping", big, {
      enabled: true,
      runId: "r",
      storageDir,
      writeFile: noop,
      thresholdChars: 50000,
      previewChars: 500,
    });
    expect(out.offloaded).toBe(true);
    expect(typeof out.result).toBe("string");
  });
});
