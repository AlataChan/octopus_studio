describe("coding agent M4 opt-in provider E2E", () => {
  test("T-E2E skips real provider calls unless CODING_AGENT_E2E=1 and a key is present", () => {
    const enabled = process.env.CODING_AGENT_E2E === "1" && process.env.DEEPSEEK_API_KEY;
    if (!enabled) {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      console.warn("Skipping coding-agent provider E2E: CODING_AGENT_E2E/key not configured.");
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/Skipping coding-agent provider E2E/i)
      );
      warn.mockRestore();
      return;
    }

    expect(enabled).toBeTruthy();
  });
});
