import { createContext, useEffect, useState } from "react";
import OctopusLogoLockupNavy from "./media/logo/octopus-studio-lockup-navy.png";
import OctopusLogoIconOrange from "./media/logo/octopus-studio-icon-orange.png";
import OctopusLogoIconNavy from "./media/logo/octopus-studio-icon-navy.png";
import System from "./models/system";

export const REFETCH_LOGO_EVENT = "refetch-logo";
export const LogoContext = createContext();

export function LogoProvider({ children }) {
  const [logo, setLogo] = useState("");
  const [isCustomLogo, setIsCustomLogo] = useState(false);
  const isLight = localStorage.getItem("theme") !== "default";
  const DefaultLogo = isLight ? OctopusLogoLockupNavy : OctopusLogoIconOrange;

  async function fetchInstanceLogo() {
    try {
      const { isCustomLogo: custom, logoURL } = await System.fetchLogo();
      if (logoURL) {
        setLogo(logoURL);
        setIsCustomLogo(custom);
      } else {
        setLogo(DefaultLogo);
        setIsCustomLogo(false);
      }
    } catch (err) {
      setLogo(DefaultLogo);
      setIsCustomLogo(false);
      console.error("Failed to fetch logo:", err);
    }
  }

  useEffect(() => {
    fetchInstanceLogo();
    window.addEventListener(REFETCH_LOGO_EVENT, fetchInstanceLogo);
    return () => {
      window.removeEventListener(REFETCH_LOGO_EVENT, fetchInstanceLogo);
    };
  }, []);

  return (
    <LogoContext.Provider value={{ logo, setLogo, isCustomLogo }}>
      {children}
    </LogoContext.Provider>
  );
}
