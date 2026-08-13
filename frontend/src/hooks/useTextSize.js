import { useState, useEffect } from "react";
import { getLocalStorageItem } from "@/utils/storage";

const TEXT_SIZE_KEY = "alata_text_size";

export default function useTextSize() {
  const [textSize, setTextSize] = useState("normal");
  const [textSizeClass, setTextSizeClass] = useState("text-[14px]");

  const getTextSizeClass = (size) => {
    switch (size) {
      case "small":
        return "text-[12px]";
      case "large":
        return "text-[18px]";
      default:
        return "text-[14px]";
    }
  };

  useEffect(() => {
    const storedTextSize = getLocalStorageItem(TEXT_SIZE_KEY);
    if (storedTextSize) {
      setTextSize(storedTextSize);
      setTextSizeClass(getTextSizeClass(storedTextSize));
    }

    const handleTextSizeChange = (event) => {
      const size = event.detail;
      setTextSize(size);
      setTextSizeClass(getTextSizeClass(size));
    };

    window.addEventListener("textSizeChange", handleTextSizeChange);
    return () => {
      window.removeEventListener("textSizeChange", handleTextSizeChange);
    };
  }, []);

  return { textSize, textSizeClass };
}
