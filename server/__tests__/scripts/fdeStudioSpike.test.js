const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { validSpec, fullBindings } = require("../utils/fde/studioSpecFixture");

const SCRIPT = path.join(__dirname, "../../scripts/fde-studio-spike.js");

function write(dir, name, data) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(data));
  return file;
}

function run(args, dir) {
  return execFileSync("node", [SCRIPT, ...args], { cwd: dir, encoding: "utf-8" });
}

describe("fde-studio-spike", () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "fde-spike-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("prints one JSON success object for an approved bound spec", () => {
    const out = run([
      "--spec", write(dir, "spec.json", validSpec()),
      "--bindings", write(dir, "bindings.json", fullBindings()),
      "--inputs", write(dir, "inputs.json", { patient_alias: "P-001", visit_note: "Two weeks." }),
      "--approved",
    ], dir);

    const result = JSON.parse(out);
    expect(result).toMatchObject({
      status: "succeeded",
      engine: "mastra",
      contract: "studio-v1",
      reviewEnforced: true,
      secretLeakCount: 0,
    });
    expect(result.sourceIrHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("reports blocked without --approved", () => {
    const out = run([
      "--spec", write(dir, "spec.json", validSpec()),
      "--bindings", write(dir, "bindings.json", fullBindings()),
      "--inputs", write(dir, "inputs.json", { patient_alias: "P", visit_note: "n" }),
    ], dir);
    expect(JSON.parse(out).status).toBe("blocked");
  });

  it("exits non-zero on an invalid spec without echoing the payload", () => {
    const spec = validSpec();
    spec.workflow.nodes[2].api_key = "super-secret-value-xyz";
    let failure;
    try {
      run([
        "--spec", write(dir, "spec.json", spec),
        "--bindings", write(dir, "bindings.json", fullBindings()),
        "--inputs", write(dir, "inputs.json", {}),
        "--approved",
      ], dir);
    } catch (e) {
      failure = e;
    }
    expect(failure).toBeDefined();
    expect(failure.status).not.toBe(0);
    expect(failure.stderr).toContain("STUDIO_SPEC_SECRET_KEY");
    expect(failure.stderr).not.toContain("super-secret-value-xyz");
  });

  it("reports draft status when bindings are missing", () => {
    const out = run([
      "--spec", write(dir, "spec.json", validSpec()),
      "--bindings", write(dir, "bindings.json", {}),
      "--inputs", write(dir, "inputs.json", {}),
      "--approved",
    ], dir);
    const result = JSON.parse(out);
    expect(result.status).toBe("draft");
    expect(result.missingBindings).toHaveLength(2);
  });
});
