jest.mock("../../utils/comKey", () => ({
  CommunicationKey: jest.fn().mockImplementation(() => ({
    encrypt: jest.fn((value) => value),
    sign: jest.fn(() => "signature"),
  })),
}));

jest.mock("../../utils/EncryptionManager", () => ({
  EncryptionManager: jest.fn().mockImplementation(() => ({
    xPayload: "payload",
  })),
}));

const { CollectorApi } = require("../../utils/collectorApi");

describe("CollectorApi endpoint", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("preserves 0.0.0.0 endpoint outside desktop runtime by default", () => {
    delete process.env.ANYTHING_LLM_RUNTIME;
    delete process.env.COLLECTOR_HOST;
    delete process.env.COLLECTOR_PORT;

    expect(new CollectorApi().endpoint).toBe("http://0.0.0.0:8888");
  });

  test("uses loopback endpoint in desktop runtime", () => {
    process.env.ANYTHING_LLM_RUNTIME = "desktop";
    delete process.env.COLLECTOR_HOST;
    process.env.COLLECTOR_PORT = "18888";

    expect(new CollectorApi().endpoint).toBe("http://127.0.0.1:18888");
  });

  test("honors explicit collector host override", () => {
    process.env.ANYTHING_LLM_RUNTIME = "desktop";
    process.env.COLLECTOR_HOST = "localhost";
    process.env.COLLECTOR_PORT = "28888";

    expect(new CollectorApi().endpoint).toBe("http://localhost:28888");
  });
});
