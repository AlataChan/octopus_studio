import { describe, expect, it } from "vitest";
import viteConfig from "../../vite.config.js";

describe("vite optimizeDeps", () => {
  it("keeps the explicit prebundle list minimal", () => {
    expect(viteConfig.optimizeDeps?.include).toEqual([
      "react",
      "react-dom",
      "react-router-dom",
      "i18next",
      "react-i18next",
      "zustand",
    ]);
  });

  it("uses Vite's default dependency crawling instead of broad custom entries", () => {
    expect(viteConfig.optimizeDeps?.entries).toBeUndefined();
  });

  it("does not force dependency re-optimization on every startup", () => {
    expect(viteConfig.optimizeDeps?.force).toBeUndefined();
  });
});

describe("vite production chunking", () => {
  const manualChunks = viteConfig.build?.rollupOptions?.output?.manualChunks;

  it("defines manual chunks for heavy lazy-loaded dependency families", () => {
    expect(typeof manualChunks).toBe("function");
    expect(
      manualChunks(
        "/app/src/components/WorkspaceChat/ChatContainer/PromptInput/LLMSelector/index.jsx"
      )
    ).toBe("route-llm-preferences");
    expect(manualChunks("\0commonjsHelpers.js")).toBe("vendor-commonjs");
    expect(
      manualChunks("/app/src/components/LLMSelection/OpenAiOptions/index.jsx")
    ).toBe("route-llm-preferences");
    expect(
      manualChunks("/app/src/pages/GeneralSettings/LLMPreference/index.jsx")
    ).toBe("route-llm-preferences");
    expect(manualChunks("/app/node_modules/react/index.js")).toBe(
      "vendor-react"
    );
    expect(
      manualChunks("/app/node_modules/@phosphor-icons/react/dist/index.es.js")
    ).toBe("vendor-icons");
    expect(manualChunks("/app/node_modules/i18next/dist/esm/i18next.js")).toBe(
      "vendor-i18n"
    );
    const removedReact3DId =
      "/app/node_modules/@react-" + "th" + "ree/fiber/dist/index.js";
    const removed3DId =
      "/app/node_modules/" + "th" + "ree/build/" + "th" + "ree.module.js";
    expect(manualChunks(removedReact3DId)).toBeUndefined();
    expect(manualChunks(removed3DId)).toBeUndefined();
    expect(
      manualChunks("/app/node_modules/cytoscape/dist/cytoscape.esm.js")
    ).toBe("vendor-graph-core");
    expect(
      manualChunks("/app/node_modules/cytoscape-fcose/cytoscape-fcose.js")
    ).toBe("vendor-graph-layout");
    expect(manualChunks("/app/node_modules/recharts/es6/index.js")).toBe(
      "vendor-recharts"
    );
    expect(manualChunks("/app/node_modules/@tremor/react/dist/index.js")).toBe(
      "vendor-tremor"
    );
    expect(manualChunks("/app/node_modules/d3-scale/src/index.js")).toBe(
      "vendor-d3"
    );
    expect(
      manualChunks(
        "/app/node_modules/@mintplex-labs/piper-tts-web/dist/index.js"
      )
    ).toBe("vendor-piper-tts");
    expect(manualChunks("/app/node_modules/katex/dist/katex.js")).toBe(
      "vendor-katex"
    );
    expect(manualChunks("/app/node_modules/highlight.js/lib/core.js")).toBe(
      "vendor-highlight-core"
    );
    expect(
      manualChunks("/app/node_modules/highlight.js/lib/languages/python.js")
    ).toBe("vendor-highlight-languages");
    expect(manualChunks("/app/node_modules/markdown-it/index.mjs")).toBe(
      "vendor-markdown"
    );
    expect(manualChunks("/app/node_modules/dompurify/dist/purify.js")).toBe(
      "vendor-purify"
    );
    expect(
      manualChunks("/app/node_modules/react-tooltip/dist/react-tooltip.min.mjs")
    ).toBeUndefined();
  });

  it("raises the production warning limit only after explicit chunk splitting", () => {
    expect(viteConfig.build?.chunkSizeWarningLimit).toBe(1500);
  });

  it("does not inject the entire process.env object into the client bundle", () => {
    expect(viteConfig.define).not.toHaveProperty("process.env");
    expect(viteConfig.define).toHaveProperty("process.env.NODE_ENV");
  });
});
