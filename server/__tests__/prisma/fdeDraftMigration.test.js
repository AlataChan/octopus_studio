const fs = require("fs");
const path = require("path");

const postgresMigration = fs.readFileSync(
  path.join(
    __dirname,
    "../../prisma/postgres/migrations/20260809141536_add_fde_workflow_drafts_and_run_engine/migration.sql"
  ),
  "utf8"
);

describe("FDE draft provider migrations", () => {
  it("backfills PostgreSQL object and legacy double-encoded metadata", () => {
    expect(postgresMigration).toContain(
      "WHEN jsonb_typeof(\"metadata\") = 'object'"
    );
    expect(postgresMigration).toContain(
      "WHEN jsonb_typeof(\"metadata\") = 'string'"
    );
    expect(postgresMigration).toContain("\"metadata\" #>> '{}'");
    expect(postgresMigration).toContain("pg_temp.try_parse_jsonb");
    expect(postgresMigration).not.toContain("substring(");
  });

  it("keeps engine nullable and the draft relation set-null", () => {
    expect(postgresMigration).toContain(
      'ALTER TABLE "runs" ADD COLUMN "engine" TEXT;'
    );
    expect(postgresMigration).toContain("ON DELETE SET NULL");
    expect(postgresMigration).not.toContain(
      'ALTER COLUMN "engine" SET NOT NULL'
    );
  });
});
