import { useContext } from "react";
import { LogoContext } from "../LogoContext";

export default function useLogo() {
  const { logo, setLogo, isCustomLogo } = useContext(LogoContext);
  return { logo, setLogo, isCustomLogo };
}
