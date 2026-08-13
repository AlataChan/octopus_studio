import Sidebar from "@/components/Sidebar";
import OfficeView from "@/components/Office/OfficeView";
import useOfficeStream from "@/hooks/useOfficeStream";
import { OFFICE_THEME } from "@/components/Office/theme";

export default function OfficePage() {
  useOfficeStream();

  return (
    <div
      className="relative flex h-screen w-screen overflow-hidden"
      style={{
        background: OFFICE_THEME.page.background,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: OFFICE_THEME.page.grid,
          backgroundSize: "40px 40px",
        }}
      />
      <Sidebar />
      <div className="relative my-[16px] mr-[16px] ml-[2px] h-[calc(100%-32px)] w-full overflow-hidden rounded-[24px]">
        <div
          className="absolute inset-0 rounded-[24px]"
          style={{
            border: `1px solid ${OFFICE_THEME.surface.border}`,
            background: OFFICE_THEME.shell.background,
            boxShadow: OFFICE_THEME.shell.shadow,
          }}
        />
        <OfficeView />
      </div>
    </div>
  );
}
