import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import WalletRow from "@/pages/Admin/Billing/WalletRow";

describe("Billing WalletRow", () => {
  it("renders the pro plan label and virtual-wallet hint", () => {
    const markup = renderToStaticMarkup(
      <table>
        <tbody>
          <WalletRow
            wallet={{
              id: "virtual-1",
              userId: 1,
              plan: "pro",
              balance: 0,
              alertThreshold: null,
              createdAt: "2026-03-01T00:00:00.000Z",
              isVirtual: true,
              user: { username: "admin", role: "admin" },
            }}
            onTopup={() => {}}
            onPlanChange={async () => ({ success: true })}
          />
        </tbody>
      </table>
    );

    expect(markup).toContain("专业版");
    expect(markup).toContain("待初始化");
  });
});
