/**
 * Bundled external registry index (offline fallback).
 *
 * Keep this minimal and safe: it is only used for discovery/search demos when
 * external downloads are disabled. Installation/refresh remains gated by
 * SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED.
 */

const BUNDLED_EXTERNAL_INDEX = [
  {
    skillId: "github:invoice-organizer",
    name: "invoice-organizer",
    description: "Organize invoices and extract structured data (PDF/OCR).",
    category: "document",
    tags: ["invoice", "pdf", "ocr"],
    icon: "🧾",
    sourceType: "github",
    sourceUrl: "https://github.com/example/invoice-organizer",
    verified: false,
  },
];

module.exports = { BUNDLED_EXTERNAL_INDEX };
