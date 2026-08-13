process.env.NODE_ENV = "test";

const { mockRequest, mockResponse } = require("../utils/testHelpers");

const mockWorkspaceGet = jest.fn();
jest.mock("../../models/workspace", () => ({
  Workspace: {
    get: (...args) => mockWorkspaceGet(...args),
  },
}));

const mockAssistantGetById = jest.fn();
jest.mock("../../models/workspaceAssistant", () => ({
  WorkspaceAssistant: {
    getById: (...args) => mockAssistantGetById(...args),
  },
}));

const mockThreadGet = jest.fn();
const mockThreadNew = jest.fn();
jest.mock("../../models/workspaceThread", () => ({
  WorkspaceThread: {
    get: (...args) => mockThreadGet(...args),
    new: (...args) => mockThreadNew(...args),
  },
}));

const mockChatSync = jest.fn();
jest.mock("../../utils/chats/apiChatHandler", () => ({
  chatSync: (...args) => mockChatSync(...args),
}));

jest.mock("../../utils/middleware/validApiKey", () => ({
  validApiKey: jest.fn((_req, _res, next) => next?.()),
}));

const mockHandlerInit = jest.fn();
const mockCreateAIbitat = jest.fn();
const mockCreateSessionEngine = jest.fn();
const mockStartAgentCluster = jest.fn();
const mockWaitForClose = jest.fn();

jest.mock("../../utils/agents/ephemeral", () => ({
  EphemeralAgentHandler: jest.fn(),
  EphemeralEventListener: jest.fn(),
}));

const mockShellHandleRequest = jest.fn();
jest.mock("../../utils/agents/runtime/responsesShell", () =>
  jest.fn().mockImplementation(() => ({
    handleRequest: (...args) => mockShellHandleRequest(...args),
  }))
);

describe("/v1/responses endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.USE_SESSION_ENGINE;

    const {
      EphemeralAgentHandler,
      EphemeralEventListener,
    } = require("../../utils/agents/ephemeral");
    EphemeralAgentHandler.mockImplementation(() => ({
      init: (...args) => mockHandlerInit(...args),
      createAIbitat: (...args) => mockCreateAIbitat(...args),
      createSessionEngine: (...args) => mockCreateSessionEngine(...args),
      startAgentCluster: (...args) => mockStartAgentCluster(...args),
    }));
    EphemeralEventListener.mockImplementation(() => ({
      waitForClose: (...args) => mockWaitForClose(...args),
    }));

    mockAssistantGetById.mockResolvedValue({
      id: "assistant_1",
      workspace: { id: 7 },
    });
    mockWorkspaceGet.mockResolvedValue({ id: 7, slug: "workspace-7" });
    mockThreadGet.mockResolvedValue(null);
    mockThreadNew.mockResolvedValue({ thread: { id: 55 } });
    mockChatSync.mockResolvedValue({ textResponse: "chat reply" });
    mockHandlerInit.mockResolvedValue();
    mockCreateAIbitat.mockResolvedValue();
    mockStartAgentCluster.mockResolvedValue();
    mockWaitForClose.mockResolvedValue({ thoughts: [], textResponse: "legacy" });
  });

  function buildRoutes() {
    const routes = {};
    const app = {
      post: jest.fn((path, middlewareOrHandler, handler) => {
        routes[`POST ${path}`] = {
          middleware:
            typeof middlewareOrHandler === "function" ? [] : middlewareOrHandler,
          handler:
            typeof middlewareOrHandler === "function"
              ? middlewareOrHandler
              : handler,
        };
      }),
    };

    const { apiResponsesEndpoints } = require("../../endpoints/api/responses");
    apiResponsesEndpoints(app);
    return routes;
  }

  function mockSseResponse() {
    const res = mockResponse();
    res.write = jest.fn(() => {
      res.headersSent = true;
      return true;
    });
    res.getHeader = jest.fn((name) => res.headers[name]);
    res.headersSent = false;
    return res;
  }

  test("uses ResponsesShell for streaming agent calls when USE_SESSION_ENGINE=true", async () => {
    process.env.USE_SESSION_ENGINE = "true";
    const sessionEngine = {
      sessionId: "session_1",
      submitMessage: jest.fn(),
      result: { type: "success", content: "shell reply" },
    };
    mockCreateSessionEngine.mockReturnValue(sessionEngine);
    mockShellHandleRequest.mockImplementation(async function* () {
      yield {
        event: "response.created",
        data: { type: "response.created", sequence_number: 1 },
      };
      yield {
        event: "response.completed",
        data: {
          type: "response.completed",
          response: { status: "completed" },
          sequence_number: 2,
        },
      };
    });

    const routes = buildRoutes();
    const route = routes["POST /v1/responses"];
    const req = mockRequest({
      body: {
        stream: true,
        model: "agent:assistant_1",
        input: "hello",
      },
      headers: {},
    });
    const res = mockSseResponse();

    await route.handler(req, res);

    expect(mockCreateSessionEngine).toHaveBeenCalledTimes(1);
    expect(mockStartAgentCluster).not.toHaveBeenCalled();
    expect(mockShellHandleRequest).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({
        model: "agent:assistant_1",
      })
    );
    expect(res.write).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('"type":"response.created"')
    );
    expect(res.write).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('"type":"response.completed"')
    );
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  test("uses SessionEngine for non-streaming agent calls when USE_SESSION_ENGINE=true", async () => {
    process.env.USE_SESSION_ENGINE = "true";
    mockCreateSessionEngine.mockReturnValue({
      sessionId: "session_2",
      submitMessage: jest.fn(async function* () {
        yield { type: "result", content: "session reply" };
      }),
      result: { type: "success", content: "session reply" },
    });

    const routes = buildRoutes();
    const route = routes["POST /v1/responses"];
    const req = mockRequest({
      body: {
        stream: false,
        model: "agent:assistant_1",
        input: "hello",
      },
      headers: {},
    });
    const res = mockResponse();

    await route.handler(req, res);

    expect(mockCreateSessionEngine).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        object: "response",
        status: "completed",
        model: "agent:assistant_1",
        output: [
          expect.objectContaining({
            role: "assistant",
            content: [
              expect.objectContaining({
                text: "session reply",
              }),
            ],
          }),
        ],
      })
    );
  });
});
