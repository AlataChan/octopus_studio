jest.mock("../../models/telemetry", () => ({
  Telemetry: { flush: jest.fn() },
}));

jest.mock("../../utils/BackgroundWorkers", () => ({
  BackgroundService: jest.fn().mockImplementation(() => ({
    boot: jest.fn(),
  })),
}));

jest.mock("../../utils/EncryptionManager", () => ({
  EncryptionManager: jest.fn(),
}));

jest.mock("../../utils/comKey", () => ({
  CommunicationKey: jest.fn(),
}));

jest.mock("../../utils/telemetry", () => jest.fn().mockResolvedValue());
jest.mock("../../utils/boot/eagerLoadContextWindows", () =>
  jest.fn().mockResolvedValue()
);
jest.mock("../../utils/upgrade", () => ({
  runUpgrade: jest.fn().mockResolvedValue(),
}));
jest.mock("../../utils/upgrade/ensureImageCanvasTables", () => ({
  ensureImageCanvasTables: jest.fn().mockResolvedValue(),
}));

const mockReadFileSync = jest.fn(() => "cert");
jest.mock("fs", () => ({
  readFileSync: (...args) => mockReadFileSync(...args),
}));

let mockHttpsServer;
const mockCreateServer = jest.fn(() => mockHttpsServer);
jest.mock("https", () => ({
  createServer: (...args) => mockCreateServer(...args),
}));

jest.mock("@mintplex-labs/express-ws", () => ({
  default: jest.fn(),
}));

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe("boot listen host binding", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockReadFileSync.mockImplementation(() => "cert");
    mockCreateServer.mockImplementation(() => mockHttpsServer);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  function createApp() {
    const listener = { on: jest.fn() };
    const app = {
      listen: jest.fn(() => listener),
    };
    return { app, listener };
  }

  test("desktop runtime listens on loopback host", async () => {
    process.env.ANYTHING_LLM_RUNTIME = "desktop";
    delete process.env.SERVER_HOST;
    const { bootHTTP } = require("../../utils/boot");
    const { app, listener } = createApp();

    bootHTTP(app, 4321);
    await flushPromises();

    expect(app.listen).toHaveBeenCalledWith(
      4321,
      "127.0.0.1",
      expect.any(Function)
    );
    expect(listener.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  test("non-desktop runtime preserves default listen overload", async () => {
    delete process.env.ANYTHING_LLM_RUNTIME;
    delete process.env.SERVER_HOST;
    const { bootHTTP } = require("../../utils/boot");
    const { app, listener } = createApp();

    bootHTTP(app, 4322);
    await flushPromises();

    expect(app.listen).toHaveBeenCalledWith(4322, expect.any(Function));
    expect(listener.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  test("desktop HTTPS runtime listens on loopback host", async () => {
    process.env.ANYTHING_LLM_RUNTIME = "desktop";
    process.env.HTTPS_KEY_PATH = "/tmp/key.pem";
    process.env.HTTPS_CERT_PATH = "/tmp/cert.pem";
    delete process.env.SERVER_HOST;
    const listener = { on: jest.fn() };
    mockHttpsServer = {
      listen: jest.fn(() => listener),
    };
    const { bootSSL } = require("../../utils/boot");
    const app = {};

    bootSSL(app, 5443);
    await flushPromises();

    expect(mockHttpsServer.listen).toHaveBeenCalledWith(
      5443,
      "127.0.0.1",
      expect.any(Function)
    );
    expect(listener.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  test("non-desktop HTTPS runtime preserves default listen overload", async () => {
    delete process.env.ANYTHING_LLM_RUNTIME;
    process.env.HTTPS_KEY_PATH = "/tmp/key.pem";
    process.env.HTTPS_CERT_PATH = "/tmp/cert.pem";
    delete process.env.SERVER_HOST;
    const listener = { on: jest.fn() };
    mockHttpsServer = {
      listen: jest.fn(() => listener),
    };
    const { bootSSL } = require("../../utils/boot");
    const app = {};

    bootSSL(app, 5444);
    await flushPromises();

    expect(mockHttpsServer.listen).toHaveBeenCalledWith(5444, expect.any(Function));
    expect(listener.on).toHaveBeenCalledWith("error", expect.any(Function));
  });
});
