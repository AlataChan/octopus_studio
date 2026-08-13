/**
 * 测试 API 路由是否正确注册
 */

const express = require("express");
const app = express();
const apiRouter = express.Router();
const isDryRun =
  process.argv.includes("--dry-run") ||
  process.env.DANGEROUS_OPS_ALLOWED !== "true";

// 加载所有端点
const { workspaceAITeamEndpoints } = require("../../endpoints/workspaceAITeam");

// 注册端点
workspaceAITeamEndpoints(apiRouter);

// 获取所有注册的路由
function getRoutes(router) {
  const routes = [];
  
  router.stack.forEach((middleware) => {
    if (middleware.route) {
      // 直接路由
      const methods = Object.keys(middleware.route.methods);
      routes.push({
        path: middleware.route.path,
        methods: methods.map(m => m.toUpperCase()),
      });
    } else if (middleware.name === "router") {
      // 嵌套路由
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          const methods = Object.keys(handler.route.methods);
          routes.push({
            path: handler.route.path,
            methods: methods.map(m => m.toUpperCase()),
          });
        }
      });
    }
  });
  
  return routes;
}

console.log(`Mode: ${isDryRun ? "DRY-RUN" : "LIVE WRITE"}`);
console.log("=== 测试 AI 团队 API 路由 ===\n");

const routes = getRoutes(apiRouter);

if (routes.length === 0) {
  console.log("❌ 没有找到任何路由！");
  console.log("这说明 workspaceAITeamEndpoints 函数没有正确注册路由。");
} else {
  console.log(`✅ 找到 ${routes.length} 个路由:\n`);
  routes.forEach((route, i) => {
    console.log(`${i + 1}. ${route.methods.join(", ")} ${route.path}`);
  });
}

console.log("\n=== 测试完成 ===");
