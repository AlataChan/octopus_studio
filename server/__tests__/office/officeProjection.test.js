const { OfficeProjection } = require("../../utils/office/officeProjection");
const { officeEventEmitter } = require("../../utils/office/officeEventEmitter");

describe("OfficeProjection", () => {
  let mockDataSources;
  let projection;

  beforeEach(() => {
    officeEventEmitter.removeAllListeners();
    mockDataSources = {
      getAssistants: jest.fn().mockResolvedValue([
        {
          id: "asst-1",
          name: "Sales Bot",
          avatar: null,
          workspaceSlug: "sales",
        },
        {
          id: "asst-2",
          name: "Support Bot",
          avatar: null,
          workspaceSlug: "support",
        },
      ]),
      getChannelAccounts: jest.fn().mockResolvedValue([
        { workspaceSlug: "sales", channels: ["slack"] },
      ]),
      getLayout: jest.fn().mockReturnValue({
        canvas: { width: 1200, height: 800 },
        zones: [
          {
            id: "z1",
            type: "workspace",
            workspaceSlug: "sales",
            gridSize: [4, 3],
            position: { x: 0, y: 0 },
            size: { w: 300, h: 300 },
          },
        ],
        furniture: [],
        features: { office3DEnabled: true },
      }),
    };
    projection = new OfficeProjection(mockDataSources);
  });

  afterEach(() => {
    projection.shutdown();
  });

  it("bootstraps with assistants from data source", async () => {
    await projection.bootstrap();
    const snapshot = projection.getSnapshot();
    expect(snapshot.actors).toHaveLength(2);
    expect(snapshot.actors[0].name).toBe("Sales Bot");
    expect(snapshot.actors[0].activeChannels).toEqual(["slack"]);
    expect(snapshot.actors[1].activeChannels).toEqual([]);
  });

  it("emits office.actor.updated when status changes", async () => {
    await projection.bootstrap();
    const events = [];
    officeEventEmitter.subscribe((e, d) => events.push({ e, d }));

    projection.handleInvocationStart("asst-1", "sess-1");
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(events.some((ev) => ev.e === "office.actor.updated")).toBe(true);
  });

  it("emits error immediately before invocation end clears the session", async () => {
    await projection.bootstrap();
    const events = [];
    officeEventEmitter.subscribe((e, d) => events.push({ e, d }));

    projection.handleInvocationStart("asst-1", "sess-1");
    projection.handleInvocationError("asst-1", "sess-1");
    projection.handleInvocationEnd("asst-1", "sess-1");

    expect(
      events.some(
        (ev) =>
          ev.e === "office.actor.updated" && ev.d.patch?.status === "error"
      )
    ).toBe(true);
  });

  it("handles invocation lifecycle", async () => {
    await projection.bootstrap();
    projection.handleInvocationStart("asst-1", "sess-1");
    expect(projection.registry.getActor("asst-1").status).toBe("thinking");

    projection.handleToolCall("asst-1", "sess-1", "web_search");
    expect(projection.registry.getActor("asst-1").status).toBe("tool_calling");
    expect(projection.registry.getActor("asst-1").currentTool).toBe(
      "web_search"
    );

    projection.handleInvocationEnd("asst-1", "sess-1");
    expect(projection.registry.getActor("asst-1").status).toBe("idle");
  });

  it("snapshot includes layout", async () => {
    await projection.bootstrap();
    const snapshot = projection.getSnapshot();
    expect(snapshot.layout.canvas.width).toBe(1200);
  });

  it("assigns channels by workspaceSlug", async () => {
    await projection.bootstrap();
    const snapshot = projection.getSnapshot();
    const salesBot = snapshot.actors.find((a) => a.id === "asst-1");
    const supportBot = snapshot.actors.find((a) => a.id === "asst-2");
    expect(salesBot.activeChannels).toEqual(["slack"]);
    expect(supportBot.activeChannels).toEqual([]);
  });

  it("channels from same workspace are shared across all actors in that workspace", async () => {
    mockDataSources.getAssistants.mockResolvedValueOnce([
      { id: "asst-1", name: "Sales Bot", avatar: null, workspaceSlug: "sales" },
      {
        id: "asst-3",
        name: "Sales Helper",
        avatar: null,
        workspaceSlug: "sales",
      },
    ]);
    await projection.bootstrap();
    const snapshot = projection.getSnapshot();
    expect(snapshot.actors[0].activeChannels).toEqual(["slack"]);
    expect(snapshot.actors[1].activeChannels).toEqual(["slack"]);
  });

  it("refreshes assistants without requiring a server restart", async () => {
    await projection.bootstrap();
    const events = [];
    officeEventEmitter.subscribe((e, d) => events.push({ e, d }));

    mockDataSources.getAssistants.mockResolvedValueOnce([
      { id: "asst-1", name: "Sales Bot", avatar: null, workspaceSlug: "sales" },
      {
        id: "asst-3",
        name: "Research Bot",
        avatar: null,
        workspaceSlug: "sales",
      },
    ]);

    await projection.refreshAssistants();

    const snapshot = projection.getSnapshot();
    expect(snapshot.actors.map((actor) => actor.id)).toEqual(["asst-1", "asst-3"]);
    expect(events.some((ev) => ev.e === "office.actor.online")).toBe(true);
    expect(
      events.some(
        (ev) => ev.e === "office.actor.offline" && ev.d.actorId === "asst-2"
      )
    ).toBe(true);
  });
});
