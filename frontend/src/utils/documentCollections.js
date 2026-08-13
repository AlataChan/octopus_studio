export function normalizeDocumentCollection(documents) {
  return documents && Array.isArray(documents.items)
    ? documents
    : { items: [] };
}

export function normalizeWorkspaceList(workspaces) {
  return Array.isArray(workspaces) ? workspaces : [];
}

export function splitDocumentCollectionsByWorkspace(localFiles, workspace) {
  const safeLocalFiles = normalizeDocumentCollection(localFiles);
  const documentsInWorkspace = Array.isArray(workspace?.documents)
    ? workspace.documents.map((doc) => doc.docpath).filter(Boolean)
    : [];

  const buildCollection = (matcher) => ({
    ...safeLocalFiles,
    items: safeLocalFiles.items.map((folder) => {
      const folderItems = Array.isArray(folder?.items) ? folder.items : [];
      if (folder?.type !== "folder") return folder;

      return {
        ...folder,
        items: folderItems.filter(
          (file) =>
            file?.type === "file" &&
            matcher(
              documentsInWorkspace.includes(`${folder.name}/${file.name}`)
            )
        ),
      };
    }),
  });

  return {
    availableDocs: buildCollection((isInWorkspace) => !isInWorkspace),
    workspaceDocs: buildCollection((isInWorkspace) => isInWorkspace),
  };
}
