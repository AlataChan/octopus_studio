import useLoginMode from "@/hooks/useLoginMode";
import usePfp from "@/hooks/usePfp";
import useUser from "@/hooks/useUser";
import System from "@/models/system";
import paths from "@/utils/paths";
import { userFromStorage } from "@/utils/request";
import { Person } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import AccountModal from "../AccountModal";
import showToast from "@/utils/toast";
import {
  AUTH_TIMESTAMP,
  AUTH_TOKEN,
  AUTH_USER,
  LAST_VISITED_WORKSPACE,
} from "@/utils/constants";
import { useTranslation } from "react-i18next";

export default function UserButton() {
  // 用户按钮已移到侧边栏 (UserCard 组件),这里不再显示
  return null;
}
