const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");
const scriptPath = path.join(
  repoRoot,
  "docker/scripts/check-production-secrets.sh"
);

const realSecret = "5f578f0f0e354d20a68c7eb9a61a8e41";

function runSecretCheck(env = {}) {
  return spawnSync("bash", [scriptPath], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      ...env,
    },
  });
}

function productionEnv(overrides = {}) {
  return {
    NODE_ENV: "production",
    JWT_SECRET: realSecret,
    AUTH_TOKEN: realSecret,
    SIG_KEY: realSecret,
    SIG_SALT: realSecret,
    INTERNAL_API_SECRET: realSecret,
    ALATA_GATEWAY_API_KEY: realSecret,
    ...overrides,
  };
}

describe("production secret validation shell gate", () => {
  test("passes when all production secrets are random-looking values", () => {
    const result = runSecretCheck(productionEnv());

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("skips validation outside production without strict opt-in", () => {
    const result = runSecretCheck({
      JWT_SECRET: "your-super-secret-jwt-key-change-me",
      AUTH_TOKEN: "change-me-single-user-password",
      SIG_KEY: "sig-key-change-me",
      SIG_SALT: "sig-salt-change-me",
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("fails when a required production secret is missing", () => {
    const result = runSecretCheck(
      productionEnv({
        JWT_SECRET: "",
      })
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("JWT_SECRET");
    expect(result.stderr).toContain("required for production");
    expect(result.stderr).toContain("openssl rand -hex 32");
  });

  test("fails when a required production secret is a placeholder", () => {
    const result = runSecretCheck(
      productionEnv({
        JWT_SECRET: "your-super-secret-jwt-key-change-me",
      })
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("JWT_SECRET");
    expect(result.stderr).toContain("placeholder");
    expect(result.stderr).toContain("openssl rand -hex 32");
  });

  test("fails when an optional production secret is set to a placeholder", () => {
    const result = runSecretCheck(
      productionEnv({
        INTERNAL_API_SECRET: "change-me-docker-internal-secret",
      })
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("INTERNAL_API_SECRET");
    expect(result.stderr).toContain("placeholder");
  });

  test("warns but passes when optional production secrets are missing", () => {
    const result = runSecretCheck(
      productionEnv({
        INTERNAL_API_SECRET: "",
        ALATA_GATEWAY_API_KEY: "",
      })
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("WARNING");
    expect(result.stderr).toContain("INTERNAL_API_SECRET");
    expect(result.stderr).toContain("ALATA_GATEWAY_API_KEY");
  });

  test("fails when optional secrets are missing under strict production validation", () => {
    const result = runSecretCheck(
      productionEnv({
        REQUIRE_PRODUCTION_SECRETS: "true",
        INTERNAL_API_SECRET: "",
        ALATA_GATEWAY_API_KEY: "",
      })
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("INTERNAL_API_SECRET");
    expect(result.stderr).toContain("ALATA_GATEWAY_API_KEY");
    expect(result.stderr).toContain("REQUIRE_PRODUCTION_SECRETS=true");
  });

  test("detects placeholder patterns case-insensitively", () => {
    const result = runSecretCheck(
      productionEnv({
        SIG_KEY: "CHANGE-ME-SECRET",
      })
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("SIG_KEY");
    expect(result.stderr).toContain("placeholder");
  });

  test("entrypoint exits before startup when production secret validation fails", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "alata-entrypoint-"));
    try {
      const stubPath = path.join(tempDir, "check-production-secrets.sh");
      const entrypointPath = path.join(tempDir, "docker-entrypoint.sh");
      const entrypointSource = fs
        .readFileSync(
          path.join(repoRoot, "docker/docker-entrypoint.sh"),
          "utf8"
        )
        .replace("/app/docker/scripts/check-production-secrets.sh", stubPath);

      fs.writeFileSync(
        stubPath,
        "#!/usr/bin/env bash\necho STUB_SECRET_FAILURE >&2\nexit 1\n",
        "utf8"
      );
      fs.chmodSync(stubPath, 0o755);
      fs.writeFileSync(entrypointPath, entrypointSource, "utf8");
      fs.chmodSync(entrypointPath, 0o755);

      const result = spawnSync("bash", [entrypointPath], {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          NODE_ENV: "production",
        },
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("STUB_SECRET_FAILURE");
      expect(result.stdout).not.toContain("STORAGE_DIR environment variable");
      expect(result.stderr).not.toContain("STORAGE_DIR environment variable");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
