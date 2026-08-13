import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BindingsPanel,
  DescribeClarifyView,
  DraftDetailView,
  DraftListView,
  PublishView,
  ReviewView,
  RunMonitorView,
  StableFdeError,
} from "@/pages/FdeWorkflows";

describe("FDE workflow loop views", () => {
  it("renders the describe and clarify entry point through compile-import", () => {
    const start = renderToStaticMarkup(<DescribeClarifyView />);
    const markup = renderToStaticMarkup(
      <DescribeClarifyView
        session={{ id: "authoring-a" }}
        turns={[{ turn_id: "turn-a", planner_reply: "Which clinic policy?" }]}
      />
    );
    expect(start).toContain("Describe requirement");
    expect(markup).toContain("Which clinic policy?");
    expect(markup).toContain("Compile and import");
  });

  it("lists only draft summaries and never renders specJson", () => {
    const markup = renderToStaticMarkup(
      <DraftListView
        drafts={[
          {
            id: "draft-a",
            status: "ready",
            revision: 2,
            specJson: "DO_NOT_RENDER",
          },
        ]}
        page={1}
      />
    );
    expect(markup).toContain("draft-a");
    expect(markup).toContain("ready");
    expect(markup).not.toContain("DO_NOT_RENDER");
  });

  it("escapes imported spec text and explains the missing first diff", () => {
    const markup = renderToStaticMarkup(
      <DraftDetailView
        draft={{ specJson: '<script>alert("x")</script>' }}
        diff={null}
      />
    );
    expect(markup).toContain("&lt;script&gt;");
    expect(markup).not.toContain("<script>");
    expect(markup).toContain("No previous version");
  });

  it("names missing binding handles and links to their configuration", () => {
    const markup = renderToStaticMarkup(
      <BindingsPanel
        slug="clinic-a"
        missing={[{ kind: "dataset", handle: "workspace_kb" }]}
      />
    );
    expect(markup).toContain("dataset");
    expect(markup).toContain("workspace_kb");
    expect(markup).toContain("/workspace/clinic-a/settings/vector-database");
  });

  it("hides approve and reject for non-admin reviewers", () => {
    const member = renderToStaticMarkup(<ReviewView isAdmin={false} />);
    const admin = renderToStaticMarkup(<ReviewView isAdmin />);
    expect(member).toContain("Request review");
    expect(member).not.toContain("Approve");
    expect(member).not.toContain("Reject");
    expect(admin).toContain("Approve");
    expect(admin).toContain("Reject");
  });

  it("disables publish with an actionable reason until approval and bindings are current", () => {
    const markup = renderToStaticMarkup(
      <PublishView
        draft={{
          reviewStatus: "requested",
          missingBindings: [{ handle: "workspace_kb" }],
        }}
      />
    );
    expect(markup).toContain("disabled");
    expect(markup).toContain("Resolve workspace_kb and obtain approval");
  });

  it("keeps trace, artifacts, cost, errors, and resume in one run monitor", () => {
    const markup = renderToStaticMarkup(
      <RunMonitorView
        run={{
          id: "run-a",
          status: "failed",
          errorCode: "STUDIO_EXEC_MODEL_FAILED",
        }}
        events={[
          {
            id: "event-a",
            type: "step.completed",
            payload: { nodeId: "draft" },
          },
        ]}
        artifacts={[{ id: "artifact-a", label: "followup.txt" }]}
      />
    );
    expect(markup).toContain("run-a");
    expect(markup).toContain("step.completed");
    expect(markup).toContain("followup.txt");
    expect(markup).toContain("Cost");
    expect(markup).toContain("Resume run");
  });

  it("shows stable codes and remediation without secret, stack, or engine leakage", () => {
    const markup = renderToStaticMarkup(
      <StableFdeError code="STUDIO_DRAFT_STALE" />
    );
    expect(markup).toContain("STUDIO_DRAFT_STALE");
    expect(markup).toContain("Request review again");
    expect(markup).not.toMatch(/Bearer|stack|mastra|octopus/i);

    const source = readFileSync(
      resolve("src/pages/FdeWorkflows/index.jsx"),
      "utf8"
    );
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });
});
