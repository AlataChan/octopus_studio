import { useState, useEffect, useCallback } from "react";
import { getLocalStorageItem, setLocalStorageItem } from "@/utils/storage";

const ALIGNMENT_STORAGE_KEY = "alata-chat-message-alignment";

/**
 * Store the message alignment in localStorage as well as provide a function to get the alignment of a message via role.
 * @returns {{msgDirection: 'left'|'left_right', setMsgDirection: (direction: string) => void, getMessageAlignment: (role: string) => string}} - The message direction and the class name for the direction.
 */
export function useChatMessageAlignment() {
  const [msgDirection, setMsgDirection] = useState(
    () => getLocalStorageItem(ALIGNMENT_STORAGE_KEY) ?? "left"
  );

  useEffect(() => {
    if (msgDirection) setLocalStorageItem(ALIGNMENT_STORAGE_KEY, msgDirection);
  }, [msgDirection]);

  const getMessageAlignment = useCallback(
    (role) => {
      const isLeftToRight = role === "user" && msgDirection === "left_right";
      return isLeftToRight ? "flex-row-reverse" : "";
    },
    [msgDirection]
  );

  return {
    msgDirection,
    setMsgDirection,
    getMessageAlignment,
  };
}
