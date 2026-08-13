import { useEffect, useState } from "react";
import Sidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";
import * as Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { UserPlus } from "@phosphor-icons/react";
import Admin from "@/models/admin";
import UserRow from "./UserRow";
import useUser from "@/hooks/useUser";
import NewUserModal from "./NewUserModal";
import { useModal } from "@/hooks/useModal";
import ModalWrapper from "@/components/ModalWrapper";
import CTAButton from "@/components/lib/CTAButton";
import { useTranslation } from "react-i18next";

export default function AdminUsers() {
  const { t } = useTranslation();
  const { isOpen, openModal, closeModal } = useModal();

  return (
    <div className="w-screen h-screen overflow-hidden bg-page-texture flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative z-[1] md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
      >
        <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px] md:py-6 py-16">
          <div className="w-full flex flex-col gap-y-1 pb-6 border-theme-border border-b-2">
            <div className="items-center flex gap-x-4">
              <p className="text-lg leading-6 font-bold text-theme-text-primary">
                {t("admin-users.title")}
              </p>
            </div>
            <p className="text-xs leading-[18px] font-base text-theme-text-secondary">
              {t("admin-users.description")}
            </p>
          </div>
          <div className="w-full justify-end flex">
            <CTAButton
              onClick={openModal}
              className="mt-3 mr-0 mb-4 md:-mb-6 z-10"
            >
              <UserPlus className="h-4 w-4" weight="bold" />{" "}
              {t("admin-users.add-user")}
            </CTAButton>
          </div>
          <div className="overflow-x-auto">
            <UsersContainer />
          </div>
        </div>
        <ModalWrapper isOpen={isOpen}>
          <NewUserModal closeModal={closeModal} />
        </ModalWrapper>
      </div>
    </div>
  );
}

function UsersContainer() {
  const { t } = useTranslation();
  const { user: currUser } = useUser();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    async function fetchUsers() {
      const _users = await Admin.users();
      setUsers(_users);
      setLoading(false);
    }
    fetchUsers();
  }, []);

  if (loading) {
    return (
      <Skeleton.default
        height="80vh"
        width="100%"
        highlightColor="var(--theme-bg-primary)"
        baseColor="var(--theme-bg-secondary)"
        count={1}
        className="w-full p-4 rounded-b-2xl rounded-tr-2xl rounded-tl-sm mt-8"
        containerClassName="flex w-full"
      />
    );
  }
  return (
    <table className="w-full text-xs text-left rounded-lg min-w-[640px] border-spacing-0">
      <thead className="text-theme-text-secondary text-xs leading-[18px] font-bold uppercase border-theme-border border-b">
        <tr>
          <th scope="col" className="px-6 py-3 rounded-tl-lg">
            {t("admin-users.table.username")}
          </th>
          <th scope="col" className="px-6 py-3">
            {t("admin-users.table.role")}
          </th>
          <th scope="col" className="px-6 py-3">
            {t("admin-users.table.date-added")}
          </th>
          <th scope="col" className="px-6 py-3 rounded-tr-lg">
            {" "}
          </th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <UserRow key={user.id} currUser={currUser} user={user} />
        ))}
      </tbody>
    </table>
  );
}

export function RoleHintDisplay({ role }) {
  const { t } = useTranslation();
  const roleHints = t(`admin-users.role-hint.${role ?? "default"}`, {
    returnObjects: true,
  });
  return (
    <div className="flex flex-col gap-y-1 py-1 pb-4">
      <p className="text-sm font-medium text-theme-text-primary">
        {t("admin-users.permissions")}
      </p>
      <ul className="flex flex-col gap-y-1 list-disc px-4">
        {(Array.isArray(roleHints) ? roleHints : []).map((hints, i) => {
          return (
            <li key={i} className="text-xs text-theme-text-secondary">
              {hints}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function MessageLimitInput({ enabled, limit, updateState, role }) {
  const { t } = useTranslation();
  if (role === "admin") return null;
  return (
    <div className="mt-4 mb-8">
      <div className="flex flex-col gap-y-1">
        <div className="flex items-center gap-x-2">
          <h2 className="text-base leading-6 font-bold text-theme-text-primary">
            {t("admin-users.limit-messages")}
          </h2>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                updateState((prev) => ({
                  ...prev,
                  enabled: e.target.checked,
                }));
              }}
              className="peer sr-only"
            />
            <div className="pointer-events-none peer h-6 w-11 rounded-full bg-[#CFCFD0] after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:shadow-xl after:border-none after:bg-white after:box-shadow-md after:transition-all after:content-[''] peer-checked:bg-[#32D583] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-transparent"></div>
          </label>
        </div>
        <p className="text-xs leading-[18px] font-base text-white/60">
          {t("admin-users.limit-messages-desc")}
        </p>
      </div>
      {enabled && (
        <div className="mt-4">
          <label className="text-theme-text-primary text-sm font-semibold block mb-4">
            {t("admin-users.message-limit")}
          </label>
          <div className="relative mt-2">
            <input
              type="number"
              onScroll={(e) => e.target.blur()}
              onChange={(e) => {
                updateState({
                  enabled: true,
                  limit: Number(e?.target?.value || 0),
                });
              }}
              value={limit}
              min={1}
              className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            />
          </div>
        </div>
      )}
    </div>
  );
}
