ALTER TABLE "workspace_graph_edges" ADD COLUMN "group" TEXT;

CREATE INDEX "workspace_graph_nodes_workspaceId_group_idx" ON "workspace_graph_nodes"("workspaceId", "group");
CREATE INDEX "workspace_graph_edges_workspaceId_group_idx" ON "workspace_graph_edges"("workspaceId", "group");
