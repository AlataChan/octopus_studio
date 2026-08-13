import React, { useState, useEffect } from "react";
import System from "../../../models/system";
import SingleUserAuth from "./SingleUserAuth";
import MultiUserAuth from "./MultiUserAuth";
import {
  AUTH_TOKEN,
  AUTH_USER,
  AUTH_TIMESTAMP,
} from "../../../utils/constants";
import {
  getLocalStorageItem,
  removeLocalStorageItem,
} from "../../../utils/storage";
import useLogo from "@/hooks/useLogo";
import { useTranslation } from "react-i18next";
import OctopusLogoIconOrange from "@/media/logo/octopus-studio-icon-orange.png";
import OctopusLogoIconNavy from "@/media/logo/octopus-studio-icon-navy.png";

export default function PasswordModal({ mode = "single" }) {
  const { logo, isCustomLogo } = useLogo();
  const { t } = useTranslation();
  const [screenSize, setScreenSize] = useState("desktop");

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) setScreenSize("mobile");
      else if (window.innerWidth < 1024) setScreenSize("tablet");
      else setScreenSize("desktop");
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 z-50 w-full overflow-x-hidden overflow-y-auto md:inset-0 h-full flex flex-col md:flex-row items-center justify-center bg-theme-bg-primary">
      {/* 桌面端：左侧插图列 - 替换为 CSS-only Hero */}
      <div className="hidden md:flex md:w-1/2 h-full items-center justify-center relative bg-theme-bg-sidebar overflow-hidden border-r border-theme-border">
        {/* Dot Grid Layer */}
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(var(--theme-border-medium) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* Subtle Accent Glow */}
        <div
          className="absolute w-[500px] h-[500px] rounded-full blur-[120px] pointer-events-none opacity-[0.15] bg-[var(--theme-accent-primary)]"
          style={{ transform: "translate(-20%, -10%)" }}
        />

        {/* Hero Content */}
        <div className="relative z-10 flex flex-col items-center text-center px-12">
                  {isCustomLogo ? (
                    <img
                      src={logo}
                      alt="Octopus Studio"
                      className="max-h-24 mb-8 object-contain"
                    />
                  ) : (
                    <div className="mb-8 flex flex-col items-center">
                      <img
                        src={OctopusLogoIconOrange}
                        alt="Octopus Studio"
                        className="h-20 w-auto mb-6 hidden light:block"
                      />
                      <img
                        src={OctopusLogoIconNavy}
                        alt="Octopus Studio"
                        className="h-20 w-auto mb-6 light:hidden"
                      />
                      <span className="text-theme-text-primary font-bold text-5xl tracking-tight">
                        Octopus
                        <span className="text-[var(--theme-accent-primary)]">
                          {" "}
                          Studio
                        </span>
                      </span>
                    </div>
                  )}
                  <p className="text-theme-text-secondary text-xl font-medium tracking-wide">
                    {t("login.multi-user.tagline")}
                  </p>
                </div>
      </div>

      {/* 移动端：顶部小图标 */}
      <div className="flex md:hidden w-full justify-center pt-12 pb-6 relative z-[1]">
        {isCustomLogo ? (
          <img
            src={logo}
            alt="Octopus Studio"
            className="w-20 h-20 object-contain"
          />
        ) : (
          <div className="text-center">
            <span className="text-theme-text-primary font-bold text-2xl">
              Octopus
              <span className="text-[var(--theme-accent-primary)]">
                {" "}
                Studio
              </span>
            </span>
          </div>
        )}
      </div>

      {/* 右侧登录表单区域 */}
      <div className="flex flex-col items-center justify-center h-full w-full lg:w-1/2 relative z-[1] md:-mt-20 lg:mt-0 mt-0 !border-none md:bg-transparent">
        {mode === "single" ? <SingleUserAuth /> : <MultiUserAuth />}
      </div>
    </div>
  );
}

export function usePasswordModal(notry = false) {
  const [auth, setAuth] = useState({
    loading: true,
    requiresAuth: false,
    mode: "single",
  });

  useEffect(() => {
    async function checkAuthReq() {
      if (!window) return;

      const currentToken = getLocalStorageItem(AUTH_TOKEN);

      // If the last validity check is still valid AND user has a token
      // we can skip the loading.
      // 修复：必须同时满足有 token 和缓存未过期才能跳过验证
      if (!System.needsAuthCheck() && notry === false && !!currentToken) {
        setAuth({
          loading: false,
          requiresAuth: false,
          mode: "multi",
        });
        return;
      }

      const settings = await System.keys();
      if (settings?.MultiUserMode) {
        // currentToken 已在上方获取，复用它
        if (currentToken) {
          const valid = notry ? false : await System.checkAuth(currentToken);
          if (!valid) {
            setAuth({
              loading: false,
              requiresAuth: true,
              mode: "multi",
            });
            removeLocalStorageItem(AUTH_USER);
            removeLocalStorageItem(AUTH_TOKEN);
            removeLocalStorageItem(AUTH_TIMESTAMP);
            return;
          } else {
            setAuth({
              loading: false,
              requiresAuth: false,
              mode: "multi",
            });
            return;
          }
        } else {
          setAuth({
            loading: false,
            requiresAuth: true,
            mode: "multi",
          });
          return;
        }
      } else {
        // Running token check in single user Auth mode.
        // If Single user Auth is disabled - skip check
        const requiresAuth = settings?.RequiresAuth || false;
        if (!requiresAuth) {
          setAuth({
            loading: false,
            requiresAuth: false,
            mode: "single",
          });
          return;
        }

        // currentToken 已在上方获取，复用它
        if (currentToken) {
          const valid = notry ? false : await System.checkAuth(currentToken);
          if (!valid) {
            setAuth({
              loading: false,
              requiresAuth: true,
              mode: "single",
            });
            removeLocalStorageItem(AUTH_TOKEN);
            removeLocalStorageItem(AUTH_USER);
            removeLocalStorageItem(AUTH_TIMESTAMP);
            return;
          } else {
            setAuth({
              loading: false,
              requiresAuth: false,
              mode: "single",
            });
            return;
          }
        } else {
          setAuth({
            loading: false,
            requiresAuth: true,
            mode: "single",
          });
          return;
        }
      }
    }
    checkAuthReq();
  }, []);

  return auth;
}
