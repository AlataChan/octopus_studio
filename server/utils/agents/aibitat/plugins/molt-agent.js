const { getMoltBroker } = require("../../../molt/broker");

function compactResult(result) {
  return JSON.stringify(result, null, 2);
}

const moltAgent = {
  name: "molt_agent",
  startupConfig: {
    params: {},
  },
  plugin: function () {
    return {
      name: this.name,
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          isReadOnly: false,
          description: `Bridge to the connected SGA-Molt runtime. Use this when the user asks to inspect Molt status, list Molt archetypes, or delegate work to a Molt agent.
Actions:
- status: report current Molt availability.
- list_archetypes: list Mission Control archetypes.
- ask_agent: send a blocking request to a Molt agent and return its answer.`,
          examples: [
            {
              prompt: "Is Molt connected?",
              call: JSON.stringify({ action: "status" }),
            },
            {
              prompt: "Ask Molt to plan this workflow",
              call: JSON.stringify({
                action: "ask_agent",
                message: "Plan this workflow",
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: ["status", "list_archetypes", "ask_agent"],
                description: "The Molt bridge action to execute.",
              },
              agentId: {
                type: "string",
                description:
                  "Optional concrete Molt agent id. Defaults to MOLT_DEFAULT_AGENT_ID or molt-matrix.",
              },
              message: {
                type: "string",
                description: "Message to send when action is ask_agent.",
              },
              conversationId: {
                type: "string",
                description:
                  "Optional Molt conversation id to continue a previous exchange.",
              },
            },
            required: ["action"],
            additionalProperties: false,
          },
          handler: async function ({
            action,
            agentId,
            message,
            conversationId,
          }) {
            const broker = getMoltBroker();
            const invocation = this.super?.handlerProps?.invocation || {};
            const user = this.super?.handlerProps?.user || {};

            try {
              if (action === "status") return compactResult(broker.status());
              if (action === "list_archetypes") {
                return compactResult(await broker.listArchetypes());
              }
              if (action === "ask_agent") {
                const result = await broker.askAgent({
                  agentId,
                  message,
                  conversationId,
                  userId: user?.id || invocation?.user_id || "alata-agent",
                  userName: user?.username || user?.name || "Alata Agent",
                });
                return result.success
                  ? result.answer || compactResult(result)
                  : compactResult(result);
              }

              return compactResult({
                success: false,
                code: "MOLT_ACTION_UNKNOWN",
                error: `Unknown action: ${action}`,
              });
            } catch (error) {
              return compactResult({
                success: false,
                code: "MOLT_AGENT_ERROR",
                error: error.message,
              });
            }
          },
        });
      },
    };
  },
};

module.exports = { moltAgent };
