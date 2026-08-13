const fs = require("node:fs");
const path = require("node:path");
const { exportLocalBindings } = require("../router/bindings");

function exportBindings({ env = process.env, outputPath = null } = {}) {
  const payload = {
    exportedAt: new Date().toISOString(),
    bindings: exportLocalBindings({ env }),
  };

  if (outputPath) {
    const resolved = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, JSON.stringify(payload, null, 2));
  }

  return payload;
}

if (require.main === module) {
  const outputPath = process.argv[2] || "data/exported-bindings.json";
  const payload = exportBindings({ outputPath });
  console.log(
    `[migration] exported ${payload.bindings.length} bindings to ${path.resolve(outputPath)}`
  );
}

module.exports = { exportBindings };
