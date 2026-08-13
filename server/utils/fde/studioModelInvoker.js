const { buildProviderRoute } = require("../workAgent/modelRouter");

function generatedText(result) {
  return (result?.content || [])
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

async function invokeStudioModel({
  systemPrompt,
  prompt,
  outputSchema,
  authCtx = {},
}) {
  const route = await buildProviderRoute(authCtx);
  const result = await route.languageModel.doGenerate({
    prompt: [
      {
        role: "system",
        content: [{ type: "text", text: systemPrompt }],
      },
      { role: "user", content: [{ type: "text", text: prompt }] },
    ],
    temperature: 0.2,
    ...(outputSchema
      ? {
          responseFormat: {
            type: "json",
            schema: outputSchema,
            name: "studio_node_output",
          },
        }
      : {}),
  });
  return {
    text: generatedText(result),
    usage: result.usage || {},
    provider: route.provider,
    model: route.model,
    pricingSource: route.pricing?.source || "unknown",
  };
}

module.exports = { invokeStudioModel };
