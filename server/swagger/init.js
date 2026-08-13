const swaggerAutogen = require("swagger-autogen")({ openapi: "3.0.0" });
const fs = require("fs");
const path = require("path");

const doc = {
  info: {
    version: "1.5.0",
    title: "Alata Studio Developer API",
    description:
      "Alata Studio 开发者 API，支持编程方式访问和管理 AI 工作台。包含计费系统、API Key 管理、通知系统等企业级功能。",
  },
  // Swagger-autogen does not allow us to use relative paths as these will resolve to
  // http:///api in the openapi.json file, so we need to monkey-patch this post-generation.
  host: "/api",
  schemes: ["http"],
  securityDefinitions: {
    BearerAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    },
  },
  security: [{ BearerAuth: [] }],
  definitions: {
    InvalidAPIKey: {
      message: "Invalid API Key",
    },
  },
  tags: [
    { name: "Authentication", description: "认证相关接口" },
    { name: "Admin", description: "管理员接口" },
    { name: "Document", description: "文档管理接口" },
    { name: "Workspace", description: "工作区管理接口" },
    { name: "System", description: "系统配置接口" },
    { name: "Billing", description: "计费系统接口 (V1.5)" },
    { name: "API Keys", description: "API Key 管理接口 (V1.5)" },
    { name: "Notifications", description: "通知系统接口 (V1.5)" },
  ],
};

const outputFile = path.resolve(__dirname, "./openapi.json");
const endpointsFiles = [
  "../endpoints/api/auth/index.js",
  "../endpoints/api/admin/index.js",
  "../endpoints/api/document/index.js",
  "../endpoints/api/workspace/index.js",
  "../endpoints/api/system/index.js",
  "../endpoints/api/workspaceThread/index.js",
  "../endpoints/api/userManagement/index.js",
  "../endpoints/api/openai/index.js",
  "../endpoints/api/embed/index.js",
  // V1.5 计费系统 API
  "../endpoints/api/billing/index.js",
  "../endpoints/api/apiKeys/index.js",
  "../endpoints/api/notifications/index.js",
];

swaggerAutogen(outputFile, endpointsFiles, doc).then(({ data }) => {
  // Remove Authorization parameters from arguments.
  for (const path of Object.keys(data.paths)) {
    if (data.paths[path].hasOwnProperty("get")) {
      let parameters = data.paths[path].get?.parameters || [];
      parameters = parameters.filter((arg) => arg.name !== "Authorization");
      data.paths[path].get.parameters = parameters;
    }

    if (data.paths[path].hasOwnProperty("post")) {
      let parameters = data.paths[path].post?.parameters || [];
      parameters = parameters.filter((arg) => arg.name !== "Authorization");
      data.paths[path].post.parameters = parameters;
    }

    if (data.paths[path].hasOwnProperty("delete")) {
      let parameters = data.paths[path].delete?.parameters || [];
      parameters = parameters.filter((arg) => arg.name !== "Authorization");
      data.paths[path].delete.parameters = parameters;
    }
  }

  const openApiSpec = {
    ...data,
    servers: [
      {
        url: "/api",
      },
    ],
  };
  fs.writeFileSync(outputFile, JSON.stringify(openApiSpec, null, 2), {
    encoding: "utf-8",
    flag: "w",
  });
  console.log(`Swagger-autogen:  \x1b[32mPatched servers.url ✔\x1b[0m`);
});
