const express = require("express");
const request = require("supertest");

jest.mock("../../utils/middleware/validatedRequest", () => ({
  validatedRequest: (_request, _response, next) => next(),
}));

jest.mock("../../utils/middleware/multiUserProtected", () => ({
  ROLES: { admin: "admin", manager: "manager", all: "all" },
  flexUserRoleValid: () => (_request, _response, next) => next(),
}));

jest.mock("../../utils/middleware/validApiKey", () => ({
  validApiKey: (_request, _response, next) => next(),
}));

const originalBillingEnabled = process.env.BILLING_ENABLED;

function withBillingFlag(value) {
  jest.resetModules();
  if (typeof value === "undefined") {
    delete process.env.BILLING_ENABLED;
  } else {
    process.env.BILLING_ENABLED = value;
  }
}

function restoreBillingFlag() {
  if (typeof originalBillingEnabled === "undefined") {
    delete process.env.BILLING_ENABLED;
  } else {
    process.env.BILLING_ENABLED = originalBillingEnabled;
  }
}

function buildApp() {
  const { billingEndpoints } = require("../../endpoints/billing");
  const { userBillingEndpoints } = require("../../endpoints/userBilling");
  const { apiBillingEndpoints } = require("../../endpoints/api/billing");
  const app = express();
  const router = express.Router();

  app.use(express.json());
  billingEndpoints(app);
  userBillingEndpoints(app, router);
  apiBillingEndpoints(app);
  app.use(router);
  return app;
}

describe("billing disabled gate", () => {
  afterEach(() => {
    restoreBillingFlag();
    jest.clearAllMocks();
  });

  test("AlertService sendBudgetAlert is skipped when BILLING_ENABLED=false", async () => {
    withBillingFlag("false");
    const { AlertService } = require("../../utils/billing/alertService");

    await expect(
      AlertService.sendBudgetAlert(
        { monthlyLimit: 100, alertAt: 50, usedThisMonth: 80 },
        1,
        [1]
      )
    ).resolves.toEqual({
      skipped: true,
      reason: "BILLING_ENABLED=false",
    });
  });

  test.each([
    ["admin billing", "get", "/admin/billing/config"],
    ["user billing", "get", "/user/billing/wallet"],
    ["api billing", "get", "/v1/billing/pricing"],
  ])("%s endpoints return BILLING_DISABLED when hidden", async (_name, method, route) => {
    withBillingFlag("false");
    const app = buildApp();

    const response = await request(app)[method](route).expect(404);

    expect(response.body).toEqual({
      success: false,
      error: "Billing feature not enabled",
      code: "BILLING_DISABLED",
    });
  });
});
