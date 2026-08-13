const axios = require("axios");
jest.mock("axios");

describe("VisualProductionClient", () => {
  let client;

  beforeEach(() => {
    jest.resetModules();
    const mockInstance = {
      get: jest.fn(),
      post: jest.fn(),
    };
    axios.create.mockReturnValue(mockInstance);
    const { VisualProductionClient } = require("../index");
    client = new VisualProductionClient("http://127.0.0.1:8868");
    client._http = mockInstance;
  });

  test("isAvailable true when /api/config returns 200", async () => {
    client._http.get.mockResolvedValue({ status: 200, data: {} });
    const res = await client.isAvailable();
    expect(res.available).toBe(true);
    expect(client._http.get).toHaveBeenCalledWith(
      "/api/config",
      expect.any(Object)
    );
  });

  test("isAvailable false when service unreachable", async () => {
    client._http.get.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await client.isAvailable();
    expect(res.available).toBe(false);
    expect(res.message).toMatch(/ECONNREFUSED|not reachable/);
  });

  test("estimate injects only provided key headers", async () => {
    client._http.post.mockResolvedValue({ data: { cost: 1 } });
    await client.estimate(
      { task: "image.poster.final" },
      { arkKey: "A", agnesKey: "G" }
    );
    const [, , opts] = client._http.post.mock.calls[0];
    expect(opts.headers["X-Ark-Key"]).toBe("A");
    expect(opts.headers["X-Agnes-Key"]).toBe("G");
    expect(opts.headers).not.toHaveProperty("X-Dashscope-Key");
  });
});
