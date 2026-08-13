import { useEffect, useState, useRef } from "react";
import Sidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";
import showToast from "@/utils/toast";
import System from "@/models/system";
import paths from "@/utils/paths";
import { AUTH_TIMESTAMP, AUTH_TOKEN, AUTH_USER } from "@/utils/constants";
import { removeLocalStorageItem } from "@/utils/storage";
import PreLoader from "@/components/Preloader";
import CTAButton from "@/components/lib/CTAButton";
import { useTranslation } from "react-i18next";
import useSystemSettings from "@/hooks/useSystemSettings";

export default function GeneralSecurity() {
  const { settings, loading } = useSystemSettings();
  const { t } = useTranslation();
  return (
    <div className="w-screen h-screen overflow-hidden bg-page-texture flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative z-[1] md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
      >
        <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px] md:pt-6">
          <p className="text-lg leading-6 font-bold text-theme-text-primary md-6 border-white light:border-theme-sidebar-border border-b-2 border-opacity-10 py-4">
            {t("security.title")}
          </p>
        </div>
        {loading ? (
          <div className="h-full transition-all duration-500 relative md:ml-[2px] md:mr-[8px] md:my-[16px] md:rounded-[26px] p-[18px] overflow-y-scroll">
            <div className="w-full h-full flex justify-center items-center">
              <PreLoader />
            </div>
          </div>
        ) : (
          <>
            <MultiUserMode multiUserModeEnabled={!!settings?.MultiUserMode} />
            <PasswordProtection
              multiUserModeEnabled={!!settings?.MultiUserMode}
              requiresAuth={!!settings?.RequiresAuth}
            />
          </>
        )}
      </div>
    </div>
  );
}

function MultiUserMode({ multiUserModeEnabled = false }) {
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [useMultiUserMode, setUseMultiUserMode] = useState(false);
  const formRef = useRef(null);
  const { t } = useTranslation();

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setHasChanges(false);
    if (useMultiUserMode) {
      // 如果事件对象存在，使用 e.target；否则使用 formRef
      const formElement = e?.target || formRef.current;
      if (!formElement) {
        showToast("Form not found", "error");
        setSaving(false);
        return;
      }

      const form = new FormData(formElement);
      const data = {
        username: form.get("username"),
        password: form.get("password"),
      };

      const { success, error } = await System.setupMultiUser(data);
      if (success) {
        showToast("Multi-User mode enabled successfully.", "success");
        setSaving(false);
        setTimeout(() => {
          removeLocalStorageItem(AUTH_USER);
          removeLocalStorageItem(AUTH_TOKEN);
          removeLocalStorageItem(AUTH_TIMESTAMP);
          window.location = paths.settings.users();
        }, 2_000);
        return;
      }

      showToast(`Failed to enable Multi-User mode: ${error}`, "error");
      setSaving(false);
      return;
    }
  };

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      onChange={() => setHasChanges(true)}
      className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px]"
    >
      <div className="w-full flex flex-col gap-y-1 w-full flex flex-col gap-y-1 pb-6 border-white light:border-theme-sidebar-border border-b-2 border-opacity-10">
        <div className="w-full flex flex-col gap-y-1">
          <div className="items-center flex gap-x-4">
            <p className="text-base font-bold text-theme-text-primary mt-6">
              {t("security.multiuser.title")}
            </p>
          </div>
          <p className="text-xs leading-[18px] font-base text-theme-text-primary text-opacity-60">
            {t("security.multiuser.description")}
          </p>
        </div>
        {hasChanges && (
          <div className="flex justify-end">
            <CTAButton
              onClick={() => handleSubmit()}
              className="mt-3 mr-0 -mb-20 z-10"
            >
              {saving ? t("common.saving") : t("common.save")}
            </CTAButton>
          </div>
        )}
        <div className="relative w-full max-h-full">
          <div className="relative rounded-lg">
            <div className="flex items-start justify-between px-6 py-4"></div>
            <div className="space-y-6 flex h-full w-full">
              <div className="w-full flex flex-col gap-y-4">
                <div className="">
                  <label className="text-theme-text-primary text-sm font-semibold block mb-3">
                    {multiUserModeEnabled
                      ? t("security.multiuser.enable.is-enable")
                      : t("security.multiuser.enable.enable")}
                  </label>

                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      onClick={() => setUseMultiUserMode(!useMultiUserMode)}
                      defaultChecked={useMultiUserMode}
                      className="peer sr-only pointer-events-none"
                    />
                    <div
                      hidden={multiUserModeEnabled}
                      className="peer-disabled:opacity-50 pointer-events-none peer h-6 w-11 rounded-full bg-[#CFCFD0] after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:shadow-xl after:border-none after:bg-white after:box-shadow-md after:transition-all after:content-[''] peer-checked:bg-[#32D583] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-transparent"
                    />
                  </label>
                </div>
                {useMultiUserMode && (
                  <div className="w-full flex flex-col gap-y-2 my-5">
                    <div className="w-80">
                      <label
                        htmlFor="username"
                        className="text-theme-text-primary text-sm font-semibold block mb-3"
                      >
                        {t("security.multiuser.enable.username")}
                      </label>
                      <input
                        name="username"
                        type="text"
                        className="border-none bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5 placeholder:text-theme-settings-input-placeholder focus:ring-blue-500"
                        placeholder="Your admin username"
                        minLength={2}
                        required={true}
                        autoComplete="off"
                        disabled={multiUserModeEnabled}
                        defaultValue={multiUserModeEnabled ? "********" : ""}
                      />
                    </div>
                    <div className="mt-4 w-80">
                      <label
                        htmlFor="password"
                        className="text-theme-text-primary text-sm font-semibold block mb-3"
                      >
                        {t("security.multiuser.enable.password")}
                      </label>
                      <input
                        name="password"
                        type="text"
                        className="border-none bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5 placeholder:text-theme-settings-input-placeholder focus:ring-blue-500"
                        placeholder="Your admin password"
                        minLength={8}
                        required={true}
                        autoComplete="off"
                        defaultValue={multiUserModeEnabled ? "********" : ""}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between space-x-14">
              <p className="text-theme-text-primary text-opacity-80 text-xs rounded-lg w-96">
                {t("security.multiuser.enable.description")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

const PW_REGEX = new RegExp(/^[a-zA-Z0-9_\-!@$%^&*();]+$/);
function PasswordProtection({
  multiUserModeEnabled = false,
  requiresAuth = false,
}) {
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [usePassword, setUsePassword] = useState(requiresAuth);
  const formRef = useRef(null);
  const { t } = useTranslation();

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (multiUserModeEnabled) return false;

    // 如果事件对象存在，使用 e.target；否则使用 formRef
    const formElement = e?.target || formRef.current;
    if (!formElement) {
      showToast("Form not found", "error");
      setSaving(false);
      return;
    }

    const form = new FormData(formElement);

    if (!PW_REGEX.test(form.get("password"))) {
      showToast(
        `Your password has restricted characters in it. Allowed symbols are _,-,!,@,$,%,^,&,*,(,),;`,
        "error"
      );
      setSaving(false);
      return;
    }

    setSaving(true);
    setHasChanges(false);
    const data = {
      usePassword,
      newPassword: form.get("password"),
    };

    const { success, error } = await System.updateSystemPassword(data);
    if (success) {
      showToast("Your page will refresh in a few seconds.", "success");
      setSaving(false);
      setTimeout(() => {
        removeLocalStorageItem(AUTH_USER);
        removeLocalStorageItem(AUTH_TOKEN);
        removeLocalStorageItem(AUTH_TIMESTAMP);
        window.location.reload();
      }, 3_000);
      return;
    } else {
      showToast(`Failed to update password: ${error}`, "error");
      setSaving(false);
    }
  };

  useEffect(() => {
    setUsePassword(requiresAuth);
  }, [requiresAuth]);

  if (multiUserModeEnabled) return null;
  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      onChange={() => setHasChanges(true)}
      className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px]"
    >
      <div className="w-full flex flex-col gap-y-1 pb-6 border-white light:border-theme-sidebar-border border-b-2 border-opacity-10">
        <div className="w-full flex flex-col gap-y-1">
          <div className="items-center flex gap-x-4">
            <p className="text-base font-bold text-theme-text-primary mt-6">
              {t("security.password.title")}
            </p>
          </div>
          <p className="text-xs leading-[18px] font-base text-theme-text-primary text-opacity-60">
            {t("security.password.description")}
          </p>
        </div>
        {hasChanges && (
          <div className="flex justify-end">
            <CTAButton
              onClick={() => handleSubmit()}
              className="mt-3 mr-0 -mb-20 z-10"
            >
              {saving ? t("common.saving") : t("common.save")}
            </CTAButton>
          </div>
        )}
        <div className="relative w-full max-h-full">
          <div className="relative rounded-lg">
            <div className="flex items-start justify-between px-6 py-4"></div>
            <div className="space-y-6 flex h-full w-full">
              <div className="w-full flex flex-col gap-y-4">
                <div className="">
                  <label className="text-theme-text-primary text-sm font-semibold block mb-3">
                    {t("security.password.title")}
                  </label>

                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      onClick={() => setUsePassword(!usePassword)}
                      defaultChecked={usePassword}
                      className="peer sr-only pointer-events-none"
                    />
                    <div className="peer-disabled:opacity-50 pointer-events-none peer h-6 w-11 rounded-full bg-[#CFCFD0] after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:shadow-xl after:border-none after:bg-white after:box-shadow-md after:transition-all after:content-[''] peer-checked:bg-[#32D583] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-transparent" />
                  </label>
                </div>
                {usePassword && (
                  <div className="w-full flex flex-col gap-y-2 my-5">
                    <div className="mt-4 w-80">
                      <label
                        htmlFor="password"
                        className="text-theme-text-primary text-sm font-semibold block mb-3"
                      >
                        {t("security.password.password-label")}
                      </label>
                      <input
                        name="password"
                        type="text"
                        className="border-none bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5 placeholder:text-theme-settings-input-placeholder"
                        placeholder="Your Instance Password"
                        minLength={8}
                        required={true}
                        autoComplete="off"
                        defaultValue={usePassword ? "********" : ""}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between space-x-14">
              <p className="text-theme-text-primary text-opacity-80 light:text-theme-text text-xs rounded-lg w-96">
                {t("security.password.description")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
