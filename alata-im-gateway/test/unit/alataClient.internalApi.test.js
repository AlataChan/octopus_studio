const nock = require("nock");
const { AlataClient } = require("../../src/client/AlataClient");

describe("AlataClient internal API", () => {
  const baseUrl = "http://alata.local/api";

  beforeEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    nock.cleanAll();
    nock.restore();
  });

  test("createRun posts workspaceSlug and internal secret", async () => {
    const client = new AlataClient({
      baseUrl,
      apiKey: "api-key",
      internalSecret: "internal-secret",
      timeout: 5000,
    });

    const scope = nock(baseUrl, {
      reqheaders: {
        authorization: "Bearer api-key",
        "x-internal-secret": "internal-secret",
      },
    })
      .post("/internal/runs/create", (body) => {
        expect(body).toEqual(
          expect.objectContaining({
            threadId: "thread-1",
            workspaceSlug: "ws-1",
            triggerType: "im",
            triggerId: "evt-1",
            initialInput: "hello",
          })
        );
        return true;
      })
      .reply(201, { runId: "run-1", status: "running" });

    const result = await client.createRun({
      threadId: "thread-1",
      workspaceSlug: "ws-1",
      triggerType: "im",
      triggerId: "evt-1",
      initialInput: "hello",
    });

    expect(result.runId).toBe("run-1");
    scope.done();
  });

  test("reportImReply posts runId and threadId", async () => {
    const client = new AlataClient({
      baseUrl,
      apiKey: "api-key",
      internalSecret: "internal-secret",
      timeout: 5000,
    });

    const scope = nock(baseUrl, {
      reqheaders: {
        authorization: "Bearer api-key",
        "x-internal-secret": "internal-secret",
      },
    })
      .post("/internal/im/reply", (body) => {
        expect(body).toEqual(
          expect.objectContaining({
            runId: "run-1",
            threadId: "thread-1",
            text: "ok",
          })
        );
        return true;
      })
      .reply(200, { ok: true });

    const result = await client.reportImReply({
      runId: "run-1",
      threadId: "thread-1",
      text: "ok",
    });

    expect(result.ok).toBe(true);
    scope.done();
  });

  test("approve/reject resolve confirmations via internal endpoint", async () => {
    const client = new AlataClient({
      baseUrl,
      apiKey: "api-key",
      internalSecret: "internal-secret",
      timeout: 5000,
    });

    const approveScope = nock(baseUrl, {
      reqheaders: {
        authorization: "Bearer api-key",
        "x-internal-secret": "internal-secret",
      },
    })
      .post("/internal/approvals/123/resolve", (body) => {
        expect(body).toEqual(
          expect.objectContaining({
            approved: true,
            reason: "ok",
            resolvedBy: "im-gateway",
          })
        );
        return true;
      })
      .reply(200, { ok: true });

    await client.approveConfirmation(123, "ok");
    approveScope.done();

    const rejectScope = nock(baseUrl, {
      reqheaders: {
        authorization: "Bearer api-key",
        "x-internal-secret": "internal-secret",
      },
    })
      .post("/internal/approvals/124/resolve", (body) => {
        expect(body).toEqual(
          expect.objectContaining({
            approved: false,
            reason: "no",
            resolvedBy: "im-gateway",
          })
        );
        return true;
      })
      .reply(200, { ok: true });

    await client.rejectConfirmation(124, "no");
    rejectScope.done();
  });
});

