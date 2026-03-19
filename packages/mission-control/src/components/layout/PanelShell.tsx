import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  useDefaultLayout,
} from "@/components/ui/resizable";
import { PANEL_DEFAULTS } from "@/styles/design-tokens";
import { PanelWrapper } from "./PanelWrapper";

const PANEL_IDS = ["sidebar", "milestone", "sliceDetail", "activeTask", "chat"] as const;

const HANDLE_CLASS =
  "bg-navy-600 hover:bg-cyan-muted transition-colors w-[2px] data-[resize-handle-active]:bg-cyan-accent";

export function PanelShell() {
  const layoutProps = useDefaultLayout({
    id: "gsd-panel-layout",
    panelIds: [...PANEL_IDS],
    storage: localStorage,
  });

  return (
    <ResizablePanelGroup
      {...layoutProps}
      orientation="horizontal"
      className="h-screen"
      id="gsd-panel-layout"
    >
      <ResizablePanel
        id="sidebar"
        defaultSize={PANEL_DEFAULTS.sidebar}
        minSize={8}
        maxSize={20}
      >
        <PanelWrapper title="Sidebar" isEmpty>
          <div />
        </PanelWrapper>
      </ResizablePanel>

      <ResizableHandle withHandle className={HANDLE_CLASS} />

      <ResizablePanel
        id="milestone"
        defaultSize={PANEL_DEFAULTS.milestone}
        minSize={15}
      >
        <PanelWrapper title="Milestone" isEmpty>
          <div />
        </PanelWrapper>
      </ResizablePanel>

      <ResizableHandle withHandle className={HANDLE_CLASS} />

      <ResizablePanel
        id="sliceDetail"
        defaultSize={PANEL_DEFAULTS.sliceDetail}
        minSize={10}
        maxSize={30}
      >
        <PanelWrapper title="Slice Detail" isEmpty>
          <div />
        </PanelWrapper>
      </ResizablePanel>

      <ResizableHandle withHandle className={HANDLE_CLASS} />

      <ResizablePanel
        id="activeTask"
        defaultSize={PANEL_DEFAULTS.activeTask}
        minSize={12}
        maxSize={30}
      >
        <PanelWrapper title="Active Task" isEmpty>
          <div />
        </PanelWrapper>
      </ResizablePanel>

      <ResizableHandle withHandle className={HANDLE_CLASS} />

      <ResizablePanel
        id="chat"
        defaultSize={PANEL_DEFAULTS.chat}
        minSize={15}
        maxSize={35}
      >
        <PanelWrapper title="Chat" isEmpty>
          <div />
        </PanelWrapper>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
