import React, { useEffect, useState } from "react";
import * as Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { Link, useMatch, useNavigate, useParams } from "react-router-dom";
import {
  CaretRight,
  DotsSixVertical,
  FlowArrow,
  GearSix,
  Graph,
  Sliders,
  UploadSimple,
} from "@phosphor-icons/react";

import Workspace from "@/models/workspace";
import paths from "@/utils/paths";
import useUser from "@/hooks/useUser";
import showToast from "@/utils/toast";
import ThreadContainer from "./ThreadContainer";
import {
  preloadRoute,
  preloadWorkspaceChat,
  preloadWorkspaceGraph,
} from "@/utils/settingsRoutePreload";
import { useSidebarData } from "@/contexts/SidebarDataContext";
import { SHOW_COMPATIBILITY_NAVIGATION } from "@/utils/studioSurfacePolicy";
import System from "@/models/system";

export default function ActiveWorkspaces() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const { user } = useUser();
  const isInWorkspaceSettings = !!useMatch("/workspace/:slug/settings/:tab");
  const isInWorkspaceGraph = !!useMatch("/workspace/:slug/graph");
  const isInFdeWorkflows = !!useMatch("/workspace/:slug/fde-workflows");
  const {
    workspaces,
    isLoading: loading,
    refresh,
    updateWorkspaces,
  } = useSidebarData();

  const [selectedWs, setSelectedWs] = useState(null);
  const [showing, setShowing] = useState(false);
  const [ManageWorkspaceModal, setManageWorkspaceModal] = useState(null);
  const [dndLib, setDndLib] = useState(null);
  const [fdeConfigured, setFdeConfigured] = useState(false);

  useEffect(() => {
    let active = true;
    System.keys().then((settings) => {
      if (active) setFdeConfigured(settings?.FdeServiceConfigured === true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (workspaces.length <= 1 || dndLib) return;

    let cancelled = false;
    import("@hello-pangea/dnd")
      .then((module) => {
        if (!cancelled) setDndLib(module);
      })
      .catch((error) => {
        console.error("Failed to load workspace drag-and-drop helpers:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [workspaces.length, dndLib]);

  useEffect(() => {
    if (!showing || ManageWorkspaceModal) return;

    let cancelled = false;
    import("../../Modals/ManageWorkspace")
      .then((module) => {
        if (!cancelled) setManageWorkspaceModal(() => module.default);
      })
      .catch((error) => {
        console.error("Failed to load manage workspace modal:", error);
        if (!cancelled) setShowing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [showing, ManageWorkspaceModal]);

  useEffect(() => {
    function onEscape(event) {
      if (!showing || event.key !== "Escape") return;
      setShowing(false);
    }

    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("keydown", onEscape);
    };
  }, [showing]);

  if (loading) {
    return (
      <WorkspaceSection>
        <Skeleton.default
          height={40}
          width="100%"
          count={5}
          baseColor="var(--theme-sidebar-item-default)"
          highlightColor="var(--theme-sidebar-item-hover)"
          enableAnimation={true}
          className="my-1"
        />
      </WorkspaceSection>
    );
  }

  function reorderWorkspaces(startIndex, endIndex) {
    const reorderedWorkspaces = Array.from(workspaces);
    const [removed] = reorderedWorkspaces.splice(startIndex, 1);
    reorderedWorkspaces.splice(endIndex, 0, removed);
    updateWorkspaces(reorderedWorkspaces);

    const success = Workspace.storeWorkspaceOrder(
      reorderedWorkspaces.map((workspace) => workspace.id)
    );

    if (!success) {
      showToast("Failed to reorder workspaces", "error");
      refresh();
    }
  }

  function showModal(workspace) {
    if (user?.role === "default") return;
    setSelectedWs(workspace);
    setShowing(true);
  }

  function hideModal() {
    setShowing(false);
  }

  const modal =
    showing && ManageWorkspaceModal
      ? React.createElement(ManageWorkspaceModal, {
          hideModal,
          providedSlug: selectedWs ? selectedWs.slug : null,
        })
      : null;

  if (dndLib && workspaces.length > 1) {
    const { DragDropContext, Droppable, Draggable } = dndLib;

    return (
      <WorkspaceSection>
        <DragDropContext
          onDragEnd={(result) => {
            if (!result.destination) return;
            reorderWorkspaces(result.source.index, result.destination.index);
          }}
        >
          <Droppable droppableId="workspaces">
            {(provided) => (
              <>
                <WorkspaceList
                  workspaces={workspaces}
                  slug={slug}
                  user={user}
                  navigate={navigate}
                  isInWorkspaceSettings={isInWorkspaceSettings}
                  isInWorkspaceGraph={isInWorkspaceGraph}
                  isInFdeWorkflows={isInFdeWorkflows}
                  fdeConfigured={fdeConfigured}
                  showModal={showModal}
                  droppableRef={provided.innerRef}
                  droppableProps={provided.droppableProps}
                  placeholder={provided.placeholder}
                  Draggable={Draggable}
                />
                {modal}
              </>
            )}
          </Droppable>
        </DragDropContext>
      </WorkspaceSection>
    );
  }

  return (
    <WorkspaceSection>
      <WorkspaceList
        workspaces={workspaces}
        slug={slug}
        user={user}
        navigate={navigate}
        isInWorkspaceSettings={isInWorkspaceSettings}
        isInWorkspaceGraph={isInWorkspaceGraph}
        isInFdeWorkflows={isInFdeWorkflows}
        fdeConfigured={fdeConfigured}
        showModal={showModal}
      />
      {modal}
    </WorkspaceSection>
  );
}

function WorkspaceSection({ children }) {
  return (
    <section aria-label="工作区" className="flex flex-col gap-y-2">
      <div className="px-4 pt-1 text-[11px] font-semibold uppercase tracking-wider text-theme-text-secondary">
        工作区
      </div>
      {children}
    </section>
  );
}

function WorkspaceList({
  workspaces,
  slug,
  user,
  navigate,
  isInWorkspaceSettings,
  isInWorkspaceGraph,
  isInFdeWorkflows,
  fdeConfigured,
  showModal,
  droppableRef = null,
  droppableProps = {},
  placeholder = null,
  Draggable = null,
}) {
  return (
    <div
      role="list"
      aria-label="Workspaces"
      className="flex flex-col gap-y-2"
      ref={droppableRef}
      {...droppableProps}
    >
      {workspaces.map((workspace, index) => {
        const isActive = workspace.slug === slug;

        if (Draggable) {
          return (
            <Draggable
              key={workspace.id}
              draggableId={workspace.id.toString()}
              index={index}
            >
              {(provided, snapshot) => (
                <WorkspaceListItem
                  workspace={workspace}
                  isActive={isActive}
                  user={user}
                  navigate={navigate}
                  isInWorkspaceSettings={isInWorkspaceSettings}
                  isInWorkspaceGraph={isInWorkspaceGraph}
                  isInFdeWorkflows={isInFdeWorkflows}
                  fdeConfigured={fdeConfigured}
                  showModal={showModal}
                  draggableProps={provided.draggableProps}
                  dragHandleProps={provided.dragHandleProps}
                  innerRef={provided.innerRef}
                  isDragging={snapshot.isDragging}
                />
              )}
            </Draggable>
          );
        }

        return (
          <WorkspaceListItem
            key={workspace.id}
            workspace={workspace}
            isActive={isActive}
            user={user}
            navigate={navigate}
            isInWorkspaceSettings={isInWorkspaceSettings}
            isInWorkspaceGraph={isInWorkspaceGraph}
            isInFdeWorkflows={isInFdeWorkflows}
            fdeConfigured={fdeConfigured}
            showModal={showModal}
          />
        );
      })}
      {placeholder}
    </div>
  );
}

function WorkspaceListItem({
  workspace,
  isActive,
  user,
  navigate,
  isInWorkspaceSettings,
  isInWorkspaceGraph,
  isInFdeWorkflows,
  fdeConfigured,
  showModal,
  draggableProps = null,
  dragHandleProps = null,
  innerRef = null,
  isDragging = false,
}) {
  const workspacePath =
    SHOW_COMPATIBILITY_NAVIGATION || !fdeConfigured
      ? paths.workspace.chat(workspace.slug)
      : paths.workspace.fdeWorkflows(workspace.slug);
  const workspaceGraphPath = paths.workspace.graph(workspace.slug);
  const fdeWorkflowsPath = paths.workspace.fdeWorkflows(workspace.slug);
  const workspaceSettingsPath = paths.workspace.settings.generalAppearance(
    workspace.slug
  );
  const handleWorkspaceIntent = () =>
    SHOW_COMPATIBILITY_NAVIGATION || !fdeConfigured
      ? preloadWorkspaceChat()
      : preloadRoute(fdeWorkflowsPath);
  const handleGraphIntent = () => preloadWorkspaceGraph();
  const handleSettingsIntent = () => preloadRoute(workspaceSettingsPath);
  const workspaceNavProps = {
    "data-tooltip-id": "workspace-name",
    "data-tooltip-content": workspace.name,
    "aria-current": isActive ? "page" : undefined,
    onFocus: handleWorkspaceIntent,
    onMouseEnter: handleWorkspaceIntent,
    onPointerDown: handleWorkspaceIntent,
    onTouchStart: handleWorkspaceIntent,
    className: `
            transition-all duration-[200ms]
            flex flex-grow w-[75%] gap-x-2 py-[6px] pl-[4px] pr-[6px] rounded-[4px] text-theme-text-primary justify-start items-center
            bg-theme-sidebar-item-default
            hover:bg-theme-sidebar-subitem-hover hover:font-bold
            ${isActive ? "bg-theme-sidebar-item-selected font-bold" : ""}
          `,
  };
  const workspaceNavContent = (
    <div className="flex flex-row justify-between w-full items-center">
      <div {...(dragHandleProps || {})} className="cursor-grab mr-[3px]">
        <DotsSixVertical
          size={20}
          color="var(--theme-sidebar-item-workspace-active)"
          weight="bold"
        />
      </div>
      <div className="flex items-center space-x-2 overflow-hidden flex-grow">
        <div className="w-[130px] overflow-hidden">
          <p
            className={`
                    text-[14px] leading-loose whitespace-nowrap overflow-hidden text-theme-text-primary
                    ${isActive ? "font-bold" : "font-medium"} truncate
                    w-full group-hover:w-[130px] group-hover:font-bold group-hover:duration-200
                  `}
          >
            {workspace.name}
          </p>
        </div>
      </div>
      {user?.role !== "default" && (
        <div
          className={`flex items-center gap-x-[2px] transition-opacity duration-200 ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        >
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              showModal(workspace);
            }}
            className="border-none rounded-md flex items-center justify-center ml-auto p-[2px] hover:bg-theme-sidebar-item-hover text-theme-text-secondary hover:text-theme-text-primary"
          >
            <UploadSimple className="h-[20px] w-[20px]" />
          </button>
          <button
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              navigate(
                isInWorkspaceSettings ? workspacePath : workspaceSettingsPath
              );
            }}
            onFocus={handleSettingsIntent}
            onMouseEnter={handleSettingsIntent}
            onPointerDown={handleSettingsIntent}
            onTouchStart={handleSettingsIntent}
            className="rounded-md flex items-center justify-center text-theme-text-secondary hover:text-theme-text-primary ml-auto p-[2px] hover:bg-theme-sidebar-item-hover"
            aria-label="General appearance settings"
          >
            <GearSix
              color={
                isInWorkspaceSettings && isActive
                  ? "var(--theme-accent-primary)"
                  : undefined
              }
              className="h-[20px] w-[20px]"
            />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div
      ref={innerRef}
      {...(draggableProps || {})}
      className={`flex flex-col w-full group ${isDragging ? "opacity-50" : ""}`}
      role="listitem"
    >
      <div className="flex gap-x-2 items-center justify-between">
        {isActive ? (
          <span {...workspaceNavProps}>{workspaceNavContent}</span>
        ) : (
          <Link to={workspacePath} {...workspaceNavProps}>
            {workspaceNavContent}
          </Link>
        )}
      </div>
      {isActive && (
        <>
          {SHOW_COMPATIBILITY_NAVIGATION && (
            <ThreadContainer workspace={workspace} isActive={isActive} />
          )}
          {fdeConfigured && (
            <Link
              to={fdeWorkflowsPath}
              onFocus={() => preloadRoute(fdeWorkflowsPath)}
              onMouseEnter={() => preloadRoute(fdeWorkflowsPath)}
              onPointerDown={() => preloadRoute(fdeWorkflowsPath)}
              onTouchStart={() => preloadRoute(fdeWorkflowsPath)}
              aria-current={isInFdeWorkflows ? "page" : undefined}
              className={`flex items-center gap-x-2 w-full mt-2 ml-[14px] px-2 py-1.5 text-sm rounded-md transition-all duration-200 group ${
                isInFdeWorkflows
                  ? "text-[var(--theme-accent-primary)] bg-[var(--theme-accent-soft)]"
                  : "text-theme-text-secondary hover:text-[var(--theme-accent-primary)] hover:bg-[var(--theme-accent-soft)]"
              }`}
            >
              <FlowArrow className="h-4 w-4" weight="bold" />
              <span>FDE 工作流</span>
              <CaretRight className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          )}
          {SHOW_COMPATIBILITY_NAVIGATION && (
            <Link
              to={workspaceGraphPath}
              onFocus={handleGraphIntent}
              onMouseEnter={handleGraphIntent}
              onPointerDown={handleGraphIntent}
              onTouchStart={handleGraphIntent}
              aria-current={isInWorkspaceGraph ? "page" : undefined}
              className={`flex items-center gap-x-2 w-full mt-2 ml-[14px] px-2 py-1.5 text-sm rounded-md transition-all duration-200 group ${
                isInWorkspaceGraph
                  ? "text-[var(--theme-accent-primary)] bg-[var(--theme-accent-soft)]"
                  : "text-theme-text-secondary hover:text-[var(--theme-accent-primary)] hover:bg-[var(--theme-accent-soft)]"
              }`}
            >
              <Graph className="h-4 w-4" weight="bold" />
              <span>知识图谱</span>
              <CaretRight className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          )}
          {user?.role !== "default" && (
            <button
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                navigate(workspaceSettingsPath);
              }}
              onFocus={handleSettingsIntent}
              onMouseEnter={handleSettingsIntent}
              onPointerDown={handleSettingsIntent}
              onTouchStart={handleSettingsIntent}
              className="flex items-center gap-x-2 w-full mt-2 ml-[14px] px-2 py-1.5 text-sm text-theme-text-secondary hover:text-[var(--theme-accent-primary)] hover:bg-[var(--theme-accent-soft)] rounded-md transition-all duration-200 group"
            >
              <Sliders className="h-4 w-4" weight="bold" />
              <span>Workspace 配置</span>
              <CaretRight className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
