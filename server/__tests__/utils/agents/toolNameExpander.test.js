const {
  expandToolNamesToFunctionIds,
} = require("../../../utils/agents/toolNameExpander");

describe("toolNameExpander", () => {
  test("expands abstract tool aliases to runtime tools", () => {
    const expanded = expandToolNamesToFunctionIds(["http-request"]);
    expect(expanded).toContain("web-browsing");
  });

  test("expands composite plugins to parent#child identifiers", () => {
    const expanded = expandToolNamesToFunctionIds(["sql-agent"]);
    expect(expanded).toContain("sql-agent#sql-query");
  });

  test("drops unknown/unloadable tools to avoid polluting functions[]", () => {
    const expanded = expandToolNamesToFunctionIds(["write-file"]);
    expect(expanded).toEqual([]);
  });
});

