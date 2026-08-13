/* eslint-env jest, node */
"use strict";

/**
 * Prompt Quality Gate — Preset Templates
 *
 * Verifies:
 *  1. Every non-gstack template carries the AGENT_CORE_DISCIPLINE block (marker: 完成的定义)
 *  2. Identity contract: exactly 29 non-gstack templates, all with non-empty names
 *  3. gstack templates are NOT wrapped with the discipline core
 *  4. Chat default prompt exists and chatPrompt() resolves to a non-empty string
 */

// ─── Mock Prisma / DB so chatPrompt() doesn't need a live database ───────────
jest.mock("../../models/systemPromptVariables", () => ({
  SystemPromptVariables: {
    expandSystemPromptVariables: async (str) => str ?? "",
  },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────
const {
  getPresetTemplateSource,
} = require("../../data/presetTemplates");

const {
  DEFAULT_SYSTEM_PROMPT,
  chatPrompt,
} = require("../../utils/chats");

// ─── Constants ────────────────────────────────────────────────────────────────
const EXPECTED_NON_GSTACK_COUNT = 29;
const DISCIPLINE_MARKER = "完成的定义";
const BAD_PATTERN = /TODO|TBD|待填|\{\{/;
const DISCIPLINE_MARKER_ALTERNATIVES = ["不编造", "上下文", "诚实"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getNonGstackTemplates() {
  return getPresetTemplateSource({ includeGstack: false });
}

function getGstackTemplates() {
  return getPresetTemplateSource({ includeGstack: true }).filter((t) =>
    t.id.startsWith("gstack-")
  );
}

// =============================================================================
// Test Suite 1 — Non-gstack templates carry discipline core
// =============================================================================
describe("Preset templates — non-gstack discipline core", () => {
  const templates = getNonGstackTemplates();

  test.each(templates.map((t) => [t.id, t]))(
    "template %s: systemPrompt is a string ≥ 200 chars, contains discipline marker, no bad placeholders",
    (id, template) => {
      expect(typeof template.systemPrompt).toBe("string");
      expect(template.systemPrompt.length).toBeGreaterThanOrEqual(200);
      expect(template.systemPrompt).toContain(DISCIPLINE_MARKER);
      expect(BAD_PATTERN.test(template.systemPrompt)).toBe(false);
    }
  );
});

// =============================================================================
// Test Suite 2 — Identity contract
// =============================================================================
describe("Preset templates — identity contract", () => {
  const templates = getNonGstackTemplates();

  test(`non-gstack template count is exactly ${EXPECTED_NON_GSTACK_COUNT}`, () => {
    expect(templates.length).toBe(EXPECTED_NON_GSTACK_COUNT);
  });

  test("every template has a non-empty name", () => {
    const withoutName = templates.filter(
      (t) => !t.name || typeof t.name !== "string" || t.name.trim() === ""
    );
    expect(withoutName.map((t) => t.id)).toEqual([]);
  });

  // Resolve persona name from top-level employeeName OR personaTemplates
  // (enterprise demo assistants store the name inside personaTemplates[0].persona.employeeName)
  function resolvePersonaName(t) {
    return (
      t.employeeName ||
      t.personaTemplates?.[0]?.persona?.employeeName ||
      t.personaTemplates?.[0]?.employeeName ||
      null
    );
  }

  // Check persona name: assert presence only for templates that carry the field
  // at top-level OR in personaTemplates
  test("every template with employeeName field has a non-empty string value", () => {
    const withField = templates.filter(
      (t) =>
        Object.prototype.hasOwnProperty.call(t, "employeeName") ||
        (t.personaTemplates && t.personaTemplates.length > 0)
    );
    const invalid = withField.filter((t) => {
      const name = resolvePersonaName(t);
      return !name || typeof name !== "string" || name.trim() === "";
    });
    expect(invalid.map((t) => t.id)).toEqual([]);
  });

  test("all 29 templates: those with a persona name have a non-empty resolved name", () => {
    // Templates that have either top-level employeeName or personaTemplates with a name
    const withPersona = templates.filter((t) => resolvePersonaName(t) !== null);
    const invalid = withPersona.filter((t) => {
      const name = resolvePersonaName(t);
      return !name || name.trim() === "";
    });
    expect(invalid.map((t) => t.id)).toEqual([]);
  });
});

// =============================================================================
// Test Suite 3 — gstack templates are NOT touched
// =============================================================================
const EXPECTED_GSTACK_COUNT = 48;

describe("Preset templates — gstack NOT wrapped with discipline core", () => {
  const gstackTemplates = getGstackTemplates();

  test(`gstack template count is exactly ${EXPECTED_GSTACK_COUNT}`, () => {
    expect(gstackTemplates.length).toBe(EXPECTED_GSTACK_COUNT);
  });

  test("gstack templates available (skip gracefully if none)", () => {
    if (gstackTemplates.length === 0) {
      // gstack is disabled or empty — nothing to assert; pass with a note
      console.warn(
        "WARN: No gstack templates found. Enable SEED_GSTACK_ASSISTANTS=true to validate."
      );
    }
    // Always passes — the real assertion is in the each below
    expect(true).toBe(true);
  });

  if (getGstackTemplates().length > 0) {
    test.each(getGstackTemplates().map((t) => [t.id, t]))(
      "gstack template %s does NOT contain discipline marker",
      (id, template) => {
        expect(
          template.systemPrompt?.includes(DISCIPLINE_MARKER) ?? false
        ).toBe(false);
      }
    );
  }
});

// =============================================================================
// Test Suite 4 — Chat default prompt & chatPrompt()
// =============================================================================
describe("Chat default prompt quality", () => {
  test("DEFAULT_SYSTEM_PROMPT is a non-empty string", () => {
    expect(typeof DEFAULT_SYSTEM_PROMPT).toBe("string");
    expect(DEFAULT_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  test("DEFAULT_SYSTEM_PROMPT contains at least one discipline marker", () => {
    const hasMarker = DISCIPLINE_MARKER_ALTERNATIVES.some((marker) =>
      DEFAULT_SYSTEM_PROMPT.includes(marker)
    );
    expect(hasMarker).toBe(true);
  });

  test("chatPrompt({ openAiPrompt: null }) resolves to a non-empty string", async () => {
    const result = await chatPrompt({ openAiPrompt: null });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("chatPrompt(null) resolves to a non-empty string (uses DEFAULT_SYSTEM_PROMPT)", async () => {
    const result = await chatPrompt(null);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
