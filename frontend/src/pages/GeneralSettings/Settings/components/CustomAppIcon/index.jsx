import System from "@/models/system";
import showToast from "@/utils/toast";
import { setFaviconHref } from "@/utils/favicon";
import { useEffect, useRef, useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

/**
 * White-label "App Icon": a single square master image (recommend 1024x1024)
 * drives the browser-tab favicon, apple-touch icon, and the desktop build source.
 * Web surfaces update live; the desktop .icns is produced at build time via
 * `yarn brand:icon`.
 */
export default function CustomAppIcon() {
  const { t } = useTranslation();
  const [iconURL, setIconURL] = useState("");
  const [isDefaultIcon, setIsDefaultIcon] = useState(true);
  const fileInputRef = useRef(null);

  useEffect(() => {
    async function init() {
      const _isDefault = await System.isDefaultAppIcon();
      setIsDefaultIcon(_isDefault);
      if (!_isDefault) {
        const { iconURL: url } = await System.fetchAppIcon();
        setIconURL(url || "");
      }
    }
    init();
  }, []);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return false;

    const objectURL = URL.createObjectURL(file);
    setIconURL(objectURL);

    const formData = new FormData();
    formData.append("icon", file);
    const { success, error, baseId } = await System.uploadAppIcon(formData);
    if (!success) {
      showToast(`Failed to upload app icon: ${error}`, "error");
      setIconURL("");
      setIsDefaultIcon(true);
      return;
    }

    setIsDefaultIcon(false);
    // Swap the live browser-tab favicon immediately so the change is visible now.
    setFaviconHref(System.appIconUrl("favicon", baseId || ""));
    showToast("App icon uploaded successfully.", "success");
  };

  const handleRemove = async () => {
    setIconURL("");
    setIsDefaultIcon(true);

    const { success, error } = await System.removeAppIcon();
    if (!success) {
      showToast(`Failed to remove app icon: ${error}`, "error");
      const _isDefault = await System.isDefaultAppIcon();
      setIsDefaultIcon(_isDefault);
      return;
    }
    showToast("App icon successfully removed.", "success");
  };

  const triggerFileInputClick = () => fileInputRef.current?.click();

  return (
    <div className="flex flex-col gap-y-0.5 my-4">
      <p className="text-sm leading-6 font-semibold text-theme-text-primary">
        {t("customization.items.appIcon.title")}
      </p>
      <p className="text-xs text-white/60">
        {t("customization.items.appIcon.description")}
      </p>
      {isDefaultIcon ? (
        <div className="flex md:flex-row flex-col items-center">
          <div className="flex flex-row gap-x-8">
            <label className="mt-3 transition-all duration-300 hover:opacity-60">
              <input
                id="app-icon-upload"
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={handleFileUpload}
              />
              <div
                className="w-[130px] h-[130px] py-4 bg-theme-settings-input-bg rounded-2xl border-2 border-dashed border-theme-text-secondary border-opacity-60 justify-center items-center inline-flex cursor-pointer"
                htmlFor="app-icon-upload"
              >
                <div className="flex flex-col items-center justify-center">
                  <div className="rounded-full bg-white/40">
                    <Plus className="w-6 h-6 text-black/80 m-2" />
                  </div>
                  <div className="text-theme-text-primary text-opacity-80 text-xs font-semibold py-1 text-center px-2">
                    {t("customization.items.appIcon.add")}
                  </div>
                  <div className="text-theme-text-secondary text-opacity-60 text-[10px] font-medium text-center px-2">
                    {t("customization.items.appIcon.recommended")}
                  </div>
                </div>
              </div>
            </label>
          </div>
        </div>
      ) : (
        <div className="flex md:flex-row flex-col items-center relative">
          <div className="group w-[130px] h-[130px] mt-3 overflow-hidden">
            <img
              src={iconURL}
              alt="App Icon"
              className="w-full h-full object-contain border-2 border-theme-text-secondary border-opacity-60 p-1 rounded-2xl bg-theme-settings-input-bg"
            />
            <div className="absolute w-[130px] top-0 left-0 right-0 bottom-0 flex flex-col gap-y-3 justify-center items-center rounded-2xl mt-3 bg-black bg-opacity-80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-in-out border-2 border-transparent hover:border-white">
              <button
                onClick={triggerFileInputClick}
                className="text-[#FFFFFF] text-sm font-medium hover:text-opacity-60 mx-2"
              >
                {t("customization.items.appIcon.replace")}
              </button>
              <input
                id="app-icon-upload"
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={handleFileUpload}
                ref={fileInputRef}
              />
              <button
                onClick={handleRemove}
                className="text-[#FFFFFF] text-sm font-medium hover:text-opacity-60 mx-2"
              >
                {t("customization.items.appIcon.remove")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
