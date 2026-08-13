const { schemas } = require("../../utils/validation");

describe("validation schemas", () => {
  describe("assistantLibrary.install", () => {
    const validBasePayload = {
      templateId: "4250b776-189a-4f31-a7c7-e41b9db04a1c",
      workspaceSlug: "demo-workspace",
    };

    it("accepts UUID template ids for user-created templates", () => {
      const { error, value } =
        schemas.assistantLibrary.install.validate(validBasePayload);

      expect(error).toBeUndefined();
      expect(value.templateId).toBe(validBasePayload.templateId);
    });

    it("accepts immutable builtin employee template ids", () => {
      const { error, value } = schemas.assistantLibrary.install.validate({
        ...validBasePayload,
        templateId: "employee-hr-resume-screener",
      });

      expect(error).toBeUndefined();
      expect(value.templateId).toBe("employee-hr-resume-screener");
    });

    it("rejects unsafe template id shapes", () => {
      const { error } = schemas.assistantLibrary.install.validate({
        ...validBasePayload,
        templateId: "../employee-hr-resume-screener",
      });

      expect(error).toBeDefined();
      expect(error.details[0].message).toBe("templateId 格式无效");
    });
  });
});
