import { useState } from "react";
import { X } from "@phosphor-icons/react";
import Button from "@/components/Button";
import Billing from "@/models/billing";
import showToast from "@/utils/toast";

const QUICK_AMOUNTS = [10000, 50000, 100000, 500000];

export default function TopupModal({ userId, closeModal, onSuccess = null }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("admin_grant");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || parseInt(amount) <= 0) {
      showToast("请输入有效的充值金额", "error");
      return;
    }

    setLoading(true);
    const result = await Billing.topup(userId, {
      amount: parseInt(amount),
      method,
      invoiceNo: invoiceNo || undefined,
      note: note || undefined,
    });

    if (result.success) {
      showToast(result.data.message || "充值成功", "success");
      if (typeof onSuccess === "function") {
        onSuccess();
      }
      closeModal();
    } else {
      showToast(result.error || "充值失败", "error");
    }
    setLoading(false);
  };

  return (
    <div className="w-full max-w-md p-6 bg-theme-bg-secondary rounded-lg shadow-xl">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-theme-text-primary">用户充值</h3>
        <button
          onClick={closeModal}
          className="text-theme-text-secondary hover:text-theme-text-primary"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 快捷金额 */}
        <div>
          <label className="block text-sm font-medium text-theme-text-secondary mb-2">
            快捷选择
          </label>
          <div className="grid grid-cols-4 gap-2">
            {QUICK_AMOUNTS.map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setAmount(val.toString())}
                className={`px-3 py-2 text-xs rounded-md transition-colors ${
                  amount === val.toString()
                    ? "bg-green-600 text-theme-text-primary"
                    : "bg-theme-bg-primary text-theme-text-secondary hover:bg-theme-bg-container"
                }`}
              >
                {(val / 10000).toFixed(0)}万
              </button>
            ))}
          </div>
        </div>

        {/* 充值金额 */}
        <div>
          <label className="block text-sm font-medium text-theme-text-secondary mb-2">
            充值金额（积分）
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="请输入充值积分数量"
            className="w-full px-3 py-2 bg-theme-bg-primary border border-theme-border rounded-md text-theme-text-primary placeholder-theme-text-secondary focus:outline-none focus:ring-2 focus:ring-green-500"
            min="1"
            required
          />
          <p className="mt-1 text-xs text-theme-text-secondary">
            1积分 ≈ ¥0.001，10000积分 = ¥10
          </p>
        </div>

        {/* 充值方式 */}
        <div>
          <label className="block text-sm font-medium text-theme-text-secondary mb-2">
            充值方式
          </label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full px-3 py-2 bg-theme-bg-primary border border-theme-border rounded-md text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="admin_grant">管理员赠送</option>
            <option value="bank_transfer">银行转账</option>
            <option value="alipay">支付宝</option>
            <option value="wechat">微信支付</option>
            <option value="invoice">对公转账</option>
          </select>
        </div>

        {/* 发票号 */}
        <div>
          <label className="block text-sm font-medium text-theme-text-secondary mb-2">
            发票/流水号（可选）
          </label>
          <input
            type="text"
            value={invoiceNo}
            onChange={(e) => setInvoiceNo(e.target.value)}
            placeholder="用于财务核对"
            className="w-full px-3 py-2 bg-theme-bg-primary border border-theme-border rounded-md text-theme-text-primary placeholder-theme-text-secondary focus:outline-none"
          />
        </div>

        {/* 备注 */}
        <div>
          <label className="block text-sm font-medium text-theme-text-secondary mb-2">
            备注（可选）
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="充值备注信息"
            rows={2}
            className="w-full px-3 py-2 bg-theme-bg-primary border border-theme-border rounded-md text-theme-text-primary placeholder-theme-text-secondary focus:outline-none resize-none"
          />
        </div>

        {/* 提交按钮 */}
        <div className="flex gap-3 pt-2">
          <Button
            className="flex-1"
            type="button"
            onClick={closeModal}
            variant="muted"
          >
            取消
          </Button>
          <Button
            className="flex-1"
            type="submit"
            disabled={loading}
            loading={loading}
          >
            {loading ? "处理中..." : "确认充值"}
          </Button>
        </div>
      </form>
    </div>
  );
}
