-- CreateTable
CREATE TABLE "workspace_graph_nodes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "nodeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "externalId" TEXT,
    "metadata" TEXT,
    "group" TEXT,
    "rank" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "workspace_graph_nodes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "workspace_graph_edges" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "weight" REAL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "workspace_graph_edges_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "workspace_graph_nodes_workspaceId_type_idx" ON "workspace_graph_nodes"("workspaceId", "type");

-- CreateIndex
CREATE INDEX "workspace_graph_nodes_workspaceId_externalId_idx" ON "workspace_graph_nodes"("workspaceId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_graph_nodes_workspaceId_nodeId_key" ON "workspace_graph_nodes"("workspaceId", "nodeId");

-- CreateIndex
CREATE INDEX "workspace_graph_edges_workspaceId_fromNodeId_idx" ON "workspace_graph_edges"("workspaceId", "fromNodeId");

-- CreateIndex
CREATE INDEX "workspace_graph_edges_workspaceId_toNodeId_idx" ON "workspace_graph_edges"("workspaceId", "toNodeId");

-- CreateIndex
CREATE INDEX "workspace_graph_edges_workspaceId_relation_idx" ON "workspace_graph_edges"("workspaceId", "relation");
