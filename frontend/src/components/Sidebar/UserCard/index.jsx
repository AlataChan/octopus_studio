import { useEffect, useRef, useState } from "react";
import useLoginMode from "@/hooks/useLoginMode";
import usePfp from "@/hooks/usePfp";
import useUser from "@/hooks/useUser";
import System from "@/models/system";
import paths from "@/utils/paths";
import { userFromStorage } from "@/utils/request";
import { Person, CaretDown } from "@phosphor-icons/react";
import AccountModal from "@/components/UserMenu/AccountModal";
import showToast from "@/utils/toast";
import {
  AUTH_TIMESTAMP,
  AUTH_TOKEN,
  AUTH_USER,
  LAST_VISITED_WORKSPACE,
} from "@/utils/constants";
import { removeLocalStorageItem } from "@/utils/storage";
import { useTranslation } from "react-i18next";

/**
 * 侧边栏用户卡片组件
 * 显示在侧边栏顶部,包含用户头像、用户名、角色和下拉菜单
 */
export default function UserCard() {
  const { t } = useTranslation();
  const mode = useLoginMode();
  const { user } = useUser();
  const menuRef = useRef();
  const buttonRef = useRef();
  const [showMenu, setShowMenu] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [supportEmail, setSupportEmail] = useState("");

  const handleClose = (event) => {
    if (
      menuRef.current &&
      !menuRef.current.contains(event.target) &&
      !buttonRef.current.contains(event.target)
    ) {
      setShowMenu(false);
    }
  };

  const handleOpenAccountModal = () => {
    setShowAccountSettings(true);
    setShowMenu(false);
  };

  useEffect(() => {
    if (showMenu) {
      document.addEventListener("mousedown", handleClose);
    }
    return () => document.removeEventListener("mousedown", handleClose);
  }, [showMenu]);

  useEffect(() => {
    const fetchSupportEmail = async () => {
      const supportEmail = await System.fetchSupportEmail();
      setSupportEmail(
        supportEmail?.email
          ? `mailto:${supportEmail.email}`
          : paths.mailToMintplex()
      );
    };
    fetchSupportEmail();
  }, []);

  if (mode === null) return null;

  return (
    <div className="relative w-full mb-4">
      <button
        ref={buttonRef}
        onClick={() => setShowMenu(!showMenu)}
        className="w-full flex items-center gap-3 p-3 rounded-lg bg-theme-bg-primary hover:bg-theme-bg-secondary transition-colors border border-theme-sidebar-border"
      >
        <UserAvatar mode={mode} />
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-medium text-theme-text-primary truncate">
            {user?.username || "用户"}
          </p>
          <p className="text-xs text-theme-text-secondary">
            {getRoleLabel(user?.role)}
          </p>
        </div>
        <CaretDown
          size={16}
          className={`text-theme-text-secondary transition-transform ${
            showMenu ? "rotate-180" : ""
          }`}
        />
      </button>

      {showMenu && (
        <div
          ref={menuRef}
          className="absolute top-full left-0 right-0 mt-2 rounded-lg bg-theme-action-menu-bg p-2 shadow-lg z-50"
        >
          <div className="flex flex-col gap-y-2">
            {mode === "multi" && !!user && (
              <button
                onClick={handleOpenAccountModal}
                className="border-none text-theme-text-primary hover:bg-theme-action-menu-item-hover w-full text-left px-4 py-2 rounded-md whitespace-nowrap text-sm"
              >
                {t("profile_settings.account")}
              </button>
            )}
            <a
              href={supportEmail}
              className="w-full text-left px-4 py-2 rounded-md whitespace-nowrap text-sm text-theme-text-primary hover:bg-theme-action-menu-item-hover"
            >
              {t("profile_settings.support")}
            </a>
            <button
              onClick={() => {
                removeLocalStorageItem(AUTH_USER);
                removeLocalStorageItem(AUTH_TOKEN);
                removeLocalStorageItem(AUTH_TIMESTAMP);
                removeLocalStorageItem(LAST_VISITED_WORKSPACE);
                showToast("您已成功登出", "success", { autoClose: 3000 });
                setTimeout(() => {
                  // intentional full reload to clear all in-memory auth state
                  // 使用 paths.login(true) 确保跳过 token 验证缓存，强制显示登录页面
                  window.location.replace(paths.login(true));
                }, 500);
              }}
              type="button"
              className="w-full text-left px-4 py-2 rounded-md whitespace-nowrap text-sm text-theme-text-primary hover:bg-theme-action-menu-item-hover"
            >
              {t("profile_settings.signout")}
            </button>
          </div>
        </div>
      )}

      {user && showAccountSettings && (
        <AccountModal
          user={user}
          hideModal={() => setShowAccountSettings(false)}
        />
      )}
    </div>
  );
}

function UserAvatar({ mode }) {
  const { pfp } = usePfp();
  const user = userFromStorage();

  if (pfp) {
    return (
      <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden bg-[var(--theme-button-sidebar-bg)]">
        <img
          src={pfp}
          alt="User profile picture"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  if (mode === "multi" && user?.username) {
    return (
      <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center bg-[var(--theme-accent-soft)] text-[var(--theme-accent-primary)] font-semibold text-sm">
        {user.username.slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center bg-[var(--theme-accent-soft)] text-[var(--theme-accent-primary)]">
      <Person size={20} />
    </div>
  );
}

function getRoleLabel(role) {
  const roleMap = {
    admin: "管理员",
    manager: "管理者",
    default: "用户",
  };
  return roleMap[role] || "用户";
}
