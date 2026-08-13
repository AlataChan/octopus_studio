const fs = require("fs");
const path = require("path");

function createOfficeDatasources() {
  return {
    getAssistants: async () => {
      try {
        const { Workspace } = require("../../models/workspace");
        const {
          WorkspaceAssistant,
        } = require("../../models/workspaceAssistant");
        const workspaces = await Workspace.where();
        const assistants = [];

        for (const workspace of workspaces) {
          const workspaceAssistants = await WorkspaceAssistant.listByWorkspace(
            workspace.id
          );
          for (const assistant of workspaceAssistants) {
            const template = assistant.template || {};
            assistants.push({
              id: String(assistant.id),
              name:
                assistant.instanceName ||
                template.employeeName ||
                template.name ||
                `Assistant ${assistant.id}`,
              title: template.employeeTitle || null,
              avatar: template.avatarUrl || null,
              workspaceSlug: workspace.slug,
            });
          }
        }

        return assistants;
      } catch (error) {
        console.error(
          "[OfficeProjection] Failed to load assistants:",
          error.message
        );
        return [];
      }
    },

    getChannelAccounts: async () => {
      try {
        const { Workspace } = require("../../models/workspace");
        const { ChannelBinding } = require("../../models/channelBinding");
        const [bindings, workspaces] = await Promise.all([
          ChannelBinding.list({ enabled: true }),
          Workspace.where(),
        ]);

        const workspaceIdToSlug = new Map();
        for (const workspace of workspaces) {
          workspaceIdToSlug.set(workspace.id, workspace.slug);
        }

        const workspaceChannels = new Map();
        for (const binding of bindings) {
          const slug = workspaceIdToSlug.get(binding.workspaceId);
          if (!slug) continue;
          if (!workspaceChannels.has(slug)) {
            workspaceChannels.set(slug, new Set());
          }
          if (binding.provider) {
            workspaceChannels.get(slug).add(binding.provider);
          }
        }

        return Array.from(workspaceChannels.entries()).map(
          ([workspaceSlug, channels]) => ({
            workspaceSlug,
            channels: Array.from(channels),
          })
        );
      } catch {
        return [];
      }
    },

    getLayout: () => {
      const configPath = path.resolve(
        __dirname,
        "../../config/office-layout.json"
      );
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    },
  };
}

module.exports = { createOfficeDatasources };
