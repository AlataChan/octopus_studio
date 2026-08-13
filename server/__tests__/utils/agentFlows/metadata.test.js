const {
  extractAgentMetadata,
  attachAgentMetadata,
  formatAgentRoles,
  hasMultiAgentCollaboration,
  getPrimaryAgent,
} = require("../../../utils/agentFlows/metadata");

describe("Agent Flow Metadata Utils", () => {
  describe("extractAgentMetadata", () => {
    it("should extract agent roles from flow result", () => {
      const flowResult = {
        success: true,
        metadata: {
          agentRoles: [
            { role: "researcher", description: "Collects info", flowId: "flow-1" },
            { role: "writer", description: "Writes content", flowId: "flow-2" },
          ],
        },
      };

      const metadata = extractAgentMetadata(flowResult);

      expect(metadata).toEqual({
        agentRoles: [
          { role: "researcher", description: "Collects info", flowId: "flow-1" },
          { role: "writer", description: "Writes content", flowId: "flow-2" },
        ],
      });
    });

    it("should return null if no metadata", () => {
      expect(extractAgentMetadata(null)).toBeNull();
      expect(extractAgentMetadata({})).toBeNull();
      expect(extractAgentMetadata({ metadata: {} })).toBeNull();
    });

    it("should return null if no agent roles", () => {
      const flowResult = {
        success: true,
        metadata: { agentRoles: [] },
      };

      expect(extractAgentMetadata(flowResult)).toBeNull();
    });
  });

  describe("attachAgentMetadata", () => {
    it("should attach metadata to response", () => {
      const response = {
        text: "Test response",
        sources: [],
        type: "chat",
      };

      const flowResult = {
        metadata: {
          agentRoles: [{ role: "researcher", description: "Test", flowId: "f1" }],
        },
      };

      const enriched = attachAgentMetadata(response, flowResult);

      expect(enriched.metadata).toBeDefined();
      expect(enriched.metadata.agentRoles).toHaveLength(1);
      expect(enriched.text).toBe("Test response");
    });

    it("should return original response if no flow result", () => {
      const response = { text: "Test", sources: [], type: "chat" };
      const enriched = attachAgentMetadata(response);

      expect(enriched).toEqual(response);
      expect(enriched.metadata).toBeUndefined();
    });
  });

  describe("formatAgentRoles", () => {
    it("should format roles with descriptions", () => {
      const roles = [
        { role: "researcher", description: "Collects info" },
        { role: "writer", description: "Writes content" },
      ];

      const formatted = formatAgentRoles(roles);

      expect(formatted).toBe("researcher (Collects info), writer (Writes content)");
    });

    it("should format roles without descriptions", () => {
      const roles = [{ role: "researcher" }, { role: "writer" }];
      const formatted = formatAgentRoles(roles);

      expect(formatted).toBe("researcher, writer");
    });

    it("should return empty string for empty array", () => {
      expect(formatAgentRoles([])).toBe("");
      expect(formatAgentRoles(null)).toBe("");
    });
  });

  describe("hasMultiAgentCollaboration", () => {
    it("should return true if has agent roles", () => {
      const flowResult = {
        metadata: {
          agentRoles: [{ role: "researcher" }],
        },
      };

      expect(hasMultiAgentCollaboration(flowResult)).toBe(true);
    });

    it("should return false if no agent roles", () => {
      expect(hasMultiAgentCollaboration(null)).toBe(false);
      expect(hasMultiAgentCollaboration({})).toBe(false);
      expect(hasMultiAgentCollaboration({ metadata: {} })).toBe(false);
      expect(hasMultiAgentCollaboration({ metadata: { agentRoles: [] } })).toBe(false);
    });
  });

  describe("getPrimaryAgent", () => {
    it("should return first agent role", () => {
      const flowResult = {
        metadata: {
          agentRoles: [
            { role: "researcher", description: "First" },
            { role: "writer", description: "Second" },
          ],
        },
      };

      const primary = getPrimaryAgent(flowResult);

      expect(primary.role).toBe("researcher");
      expect(primary.description).toBe("First");
    });

    it("should return null if no agents", () => {
      expect(getPrimaryAgent(null)).toBeNull();
      expect(getPrimaryAgent({})).toBeNull();
    });
  });
});
