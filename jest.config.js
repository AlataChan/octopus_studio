/**
 * Root Jest config.
 *
 * This repo is a Yarn workspace with multiple packages:
 * - `server/` uses Jest
 * - `collector/` uses Jest
 * - `frontend/` uses Vitest (do not run with Jest)
 *
 * Running Jest at the repo root should delegate to each package's config to
 * avoid accidentally executing non-Jest test files (e.g. Vitest suites) or
 * utility scripts located under `__tests__/`.
 */

module.exports = {
  projects: [
    "<rootDir>/server/jest.config.js",
    "<rootDir>/collector/jest.config.js",
    {
      displayName: "importer",
      rootDir: ".",
      testEnvironment: "node",
      testMatch: [
        "<rootDir>/scripts/import-agency-agents/__tests__/**/*.test.js",
      ],
      clearMocks: true,
      resetMocks: true,
    },
  ],
};
