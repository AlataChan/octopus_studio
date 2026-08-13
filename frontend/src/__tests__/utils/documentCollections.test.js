import { describe, expect, it } from "vitest";
import {
  normalizeDocumentCollection,
  normalizeWorkspaceList,
  splitDocumentCollectionsByWorkspace,
} from "@/utils/documentCollections";

describe("document collection null guards", () => {
  it("normalizes failed local-files responses to an empty collection", () => {
    expect(normalizeDocumentCollection(null)).toEqual({ items: [] });
    expect(normalizeDocumentCollection({ items: "bad-shape" })).toEqual({
      items: [],
    });
  });

  it("normalizes failed workspace list responses to an empty array", () => {
    expect(normalizeWorkspaceList(null)).toEqual([]);
    expect(normalizeWorkspaceList({ length: 1 })).toEqual([]);
  });

  it("splits document buckets without throwing when API calls return null", () => {
    const { availableDocs, workspaceDocs } =
      splitDocumentCollectionsByWorkspace(null, null);

    expect(availableDocs).toEqual({ items: [] });
    expect(workspaceDocs).toEqual({ items: [] });
  });
});
