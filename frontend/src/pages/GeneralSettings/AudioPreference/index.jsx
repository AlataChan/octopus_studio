import React from "react";
import { isMobile } from "react-device-detect";
import Sidebar from "@/components/SettingsSidebar";
import PreLoader from "@/components/Preloader";
import SpeechToTextProvider from "./stt";
import TextToSpeechProvider from "./tts";
import useSystemSettings from "@/hooks/useSystemSettings";

export default function AudioPreference() {
  const { settings, loading } = useSystemSettings();

  return (
    <div className="w-screen h-screen overflow-hidden bg-page-texture flex">
      <Sidebar />
      {loading ? (
        <div
          style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
          className="relative z-[1] md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
        >
          <div className="w-full h-full flex justify-center items-center">
            <PreLoader />
          </div>
        </div>
      ) : (
        <div
          style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
          className="relative z-[1] md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
        >
          <SpeechToTextProvider settings={settings} />
          <TextToSpeechProvider settings={settings} />
        </div>
      )}
    </div>
  );
}
