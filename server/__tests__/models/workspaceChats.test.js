jest.mock("../../utils/prisma", () => ({
  workspace_chats: {
    create: jest.fn(),
  },
}));

jest.mock("../../utils/chats/graphBuilder", () => ({
  GraphBuilder: {
    createChatNode: jest.fn(),
  },
}));

const prisma = require("../../utils/prisma");
const { WorkspaceChats } = require("../../models/workspaceChats");

describe("WorkspaceChats model", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("new", () => {
    it("omits assistant_id when no assistant is selected", async () => {
      prisma.workspace_chats.create.mockResolvedValue({
        id: 1,
        response: "{}",
      });

      await WorkspaceChats.new({
        workspaceId: 1,
        prompt: "hello",
        response: { text: "hi" },
        assistantId: null,
      });

      const data = prisma.workspace_chats.create.mock.calls[0][0].data;
      expect(Object.prototype.hasOwnProperty.call(data, "assistant_id")).toBe(
        false
      );
    });

    it("persists assistant_id when an assistant is selected", async () => {
      prisma.workspace_chats.create.mockResolvedValue({
        id: 1,
        response: "{}",
      });

      await WorkspaceChats.new({
        workspaceId: 1,
        prompt: "hello",
        response: { text: "hi" },
        assistantId: "asst-1",
      });

      expect(prisma.workspace_chats.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ assistant_id: "asst-1" }),
      });
    });
  });
});
