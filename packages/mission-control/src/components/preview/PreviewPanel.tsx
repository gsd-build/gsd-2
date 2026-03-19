/**
 * PreviewPanel — pure render component for the live preview overlay.
 *
 * No hooks, no side effects. Accepts all state and callbacks as props.
 * Pattern matches ReviewView (pure) + ReviewViewWithAnimation (stateful).
 *
 * Slide-in animation: "animate-in slide-in-from-right duration-200"
 * identical to DecisionLogDrawer.tsx
 *
 * Props:
 * - servers: list of detected dev servers (empty = no server detected)
 * - activeFrontendPort: currently selected frontend server port
 * - activeBackendPort: currently selected backend server port
 * - viewport: current viewport mode
 * - scanning: whether a scan is in progress
 * - onClose: callback for close button
 * - onSelectFrontendPort: callback when frontend server selection changes
 * - onSelectBackendPort: callback when backend server selection changes
 * - onViewportChange: callback for viewport button clicks
 * - onScan: triggers a server scan
 * - onAddManualPort: add a manually entered port
 * - isNativeApp: show "No web preview" empty state
 * - dualLeftPort/dualRightPort: independent server ports for dual mode
 * - onDualLeftPortChange/onDualRightPortChange: callbacks for dual mode selectors
 * - browserScreenshot: when set, shows browser agent view instead of iframe
 * - onClearBrowserScreenshot: callback to clear browser agent view
 */
import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { ViewportSwitcher } from "./ViewportSwitcher";
import { DeviceFrame } from "./DeviceFrame";
import { ErrorBoundaryFrame } from "./ErrorBoundaryFrame";
import type { DetectedServer, Viewport } from "@/hooks/usePreview";

export interface PreviewPanelProps {
  servers: DetectedServer[];
  activeFrontendPort: number | null;
  activeBackendPort: number | null;
  viewport: Viewport;
  scanning: boolean;
  onClose: () => void;
  onSelectFrontendPort: (port: number | null) => void;
  onSelectBackendPort: (port: number | null) => void;
  onViewportChange: (viewport: Viewport) => void;
  onScan: () => void;
  onAddManualPort: (port: number) => void;
  isNativeApp?: boolean;
  // Dual-mode independent server selectors
  dualLeftPort?: number | null;
  dualRightPort?: number | null;
  onDualLeftPortChange?: (port: number | null) => void;
  onDualRightPortChange?: (port: number | null) => void;
  // Browser agent screenshot relay
  browserScreenshot?: { screenshot: string; url: string; title: string } | null;
  onClearBrowserScreenshot?: () => void;
}

export function PreviewPanel({
  servers,
  activeFrontendPort,
  activeBackendPort: _activeBackendPort,
  viewport,
  scanning,
  onClose,
  onSelectFrontendPort,
  onSelectBackendPort: _onSelectBackendPort,
  onViewportChange,
  onScan,
  onAddManualPort,
  isNativeApp = false,
  dualLeftPort,
  dualRightPort,
  onDualLeftPortChange,
  onDualRightPortChange,
  browserScreenshot = null,
  onClearBrowserScreenshot,
}: PreviewPanelProps) {
  // Desktop sub-tab: which server is active in desktop view
  const [desktopActiveServer, setDesktopActiveServer] = useState<number | null>(
    activeFrontendPort
  );

  // Sync desktopActiveServer when activeFrontendPort arrives after async scan (Fix 4)
  useEffect(() => {
    if (desktopActiveServer === null && activeFrontendPort !== null) {
      setDesktopActiveServer(activeFrontendPort);
    }
  }, [activeFrontendPort]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Manual port input state for empty state
  const [manualPortInput, setManualPortInput] = useState("");

  const frontendServers = servers.filter((s) => s.type === "frontend");

  // Desktop active server falls back to activeFrontendPort if not set
  const effectiveDesktopServer = desktopActiveServer ?? activeFrontendPort;

  // Dual fallback: if dualLeftPort/dualRightPort not set, use activeFrontendPort
  const effectiveDualLeft = dualLeftPort ?? activeFrontendPort;
  const effectiveDualRight = dualRightPort ?? activeFrontendPort;

  const renderServerSelector = (
    selectedPort: number | null,
    onSelect: (port: number | null) => void,
    filteredServers: DetectedServer[] = servers
  ) => (
    <select
      value={selectedPort ?? ""}
      onChange={(e) => {
        const val = e.target.value;
        onSelect(val ? Number(val) : null);
      }}
      className="bg-navy-800 border border-navy-600 rounded px-2 py-0.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-accent/50"
    >
      <option value="">Select server...</option>
      {filteredServers.map((s) => (
        <option key={s.port} value={s.port}>
          {s.label ?? `Port ${s.port}`}
        </option>
      ))}
    </select>
  );

  return (
    <div className="animate-in slide-in-from-right duration-200 flex flex-col h-full bg-[#0F1419] flex-1 min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-navy-700 px-3 py-2 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-display uppercase tracking-wider text-slate-300">
            Live Preview
          </span>

          {/* Browser Agent mode badge */}
          {browserScreenshot && (
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
              Browser Agent
            </span>
          )}

          {/* Server selector or empty state controls — hidden during browser agent view */}
          {!browserScreenshot && (scanning ? (
            <span className="text-xs text-slate-400 font-mono">Scanning...</span>
          ) : servers.length === 0 ? (
            <div className="flex items-center gap-2">
              <button
                onClick={onScan}
                className="text-xs px-2 py-0.5 rounded bg-navy-700 hover:bg-navy-600 text-slate-300 transition-colors"
              >
                Scan for servers
              </button>
              <input
                type="number"
                value={manualPortInput}
                onChange={(e) => setManualPortInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && manualPortInput) {
                    onAddManualPort(Number(manualPortInput));
                    setManualPortInput("");
                  }
                }}
                placeholder="port"
                className="w-16 bg-navy-800 border border-navy-600 rounded px-2 py-0.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-accent/50"
              />
            </div>
          ) : viewport === "desktop" ? (
            // Desktop: show all servers in dropdown
            renderServerSelector(effectiveDesktopServer, (port) => {
              setDesktopActiveServer(port);
              onSelectFrontendPort(port);
            })
          ) : viewport === "tablet" || viewport === "mobile" ? (
            // Tablet/Mobile: show only frontend servers
            renderServerSelector(activeFrontendPort, onSelectFrontendPort, frontendServers.length > 0 ? frontendServers : servers)
          ) : null /* Dual mode: per-frame selectors shown in content area */
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Viewport switcher in header */}
          <ViewportSwitcher viewport={viewport} onViewportChange={onViewportChange} />

          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close preview"
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-navy-700 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Desktop sub-tabs — shown when multiple servers and viewport=desktop and no browser agent view */}
      {!browserScreenshot && viewport === "desktop" && servers.length > 1 && (
        <div className="flex border-b border-navy-700 px-3 flex-shrink-0 overflow-x-auto">
          {servers.map((s) => (
            <button
              key={s.port}
              onClick={() => {
                setDesktopActiveServer(s.port);
                onSelectFrontendPort(s.port);
              }}
              className={[
                "text-xs font-mono px-3 py-1.5 border-b-2 whitespace-nowrap transition-colors",
                effectiveDesktopServer === s.port
                  ? "border-cyan-accent text-slate-200"
                  : "border-transparent text-slate-500 hover:text-slate-300",
              ].join(" ")}
            >
              {s.label ?? `Port ${s.port}`}
            </button>
          ))}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 min-h-0 relative bg-[#0a0d12]">
        {browserScreenshot ? (
          /* Browser agent view — shows what GSD's headless Chromium is looking at */
          <div className="absolute inset-0 flex flex-col">
            {/* URL bar */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-navy-800 border-b border-navy-700 flex-shrink-0">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-xs font-mono text-slate-300 truncate flex-1">
                {browserScreenshot.url || "about:blank"}
              </span>
              {browserScreenshot.title && (
                <span className="text-xs text-slate-500 truncate max-w-[200px]">
                  {browserScreenshot.title}
                </span>
              )}
            </div>
            {/* Screenshot */}
            <div className="flex-1 min-h-0 overflow-auto bg-black flex items-start justify-center">
              <img
                src={`data:image/jpeg;base64,${browserScreenshot.screenshot}`}
                alt="Browser agent view"
                className="max-w-full h-auto"
                style={{ imageRendering: "auto" }}
              />
            </div>
          </div>
        ) : isNativeApp ? (
          <div className="absolute inset-0 flex items-center justify-center text-center text-slate-500">
            <p className="text-sm">No web preview available for native apps</p>
          </div>
        ) : viewport === "dual" ? (
          /* Dual mode: scrollable so fixed-size device frames don't clip */
          <div className="absolute inset-0 overflow-auto">
            <div className="flex items-start justify-center gap-6 p-6">
              {/* Pixel/Android frame — left */}
              {/* key resets ErrorBoundary when the port changes (Fix: dual mode no-key bug) */}
              <div className="flex flex-col items-center gap-2">
                {renderServerSelector(
                  effectiveDualLeft,
                  (port) => onDualLeftPortChange?.(port),
                )}
                <ErrorBoundaryFrame key={effectiveDualLeft ?? "left"}>
                  <DeviceFrame
                    device="pixel"
                    src={effectiveDualLeft ? `http://localhost:${effectiveDualLeft}/` : undefined}
                    iframeId="preview-iframe-pixel"
                  />
                </ErrorBoundaryFrame>
              </div>

              {/* iPhone/iOS frame — right */}
              {/* key resets ErrorBoundary when the port changes (Fix: dual mode no-key bug) */}
              <div className="flex flex-col items-center gap-2">
                {renderServerSelector(
                  effectiveDualRight,
                  (port) => onDualRightPortChange?.(port),
                )}
                <ErrorBoundaryFrame key={effectiveDualRight ?? "right"}>
                  <DeviceFrame
                    device="iphone"
                    src={effectiveDualRight ? `http://localhost:${effectiveDualRight}/` : undefined}
                    iframeId="preview-iframe-iphone"
                  />
                </ErrorBoundaryFrame>
              </div>
            </div>
          </div>
        ) : (
          /* Single viewport: absolute fill + centered for tablet/mobile max-width */
          /* key={viewport} forces ErrorBoundaryFrame remount on viewport switch.            */
          /* The iframe is only rendered when a real src is available — rendering with       */
          /* src=undefined causes an undefined→URL navigation that loads the app into the   */
          /* iframe, and the subsequent unmount (on next viewport switch) triggers the       */
          /* browser's beforeunload dialog. Guard prevents that lifecycle entirely.         */
          <ErrorBoundaryFrame key={viewport}>
            {(() => {
              const src =
                viewport === "desktop"
                  ? effectiveDesktopServer
                    ? `http://localhost:${effectiveDesktopServer}/`
                    : null
                  : activeFrontendPort
                  ? `http://localhost:${activeFrontendPort}/`
                  : null;

              if (!src) {
                return (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs font-mono">
                    No server selected
                  </div>
                );
              }

              return (
                <iframe
                  src={src}
                  title="Live Preview"
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width:
                      viewport === "desktop"
                        ? "100%"
                        : viewport === "tablet"
                        ? "768px"
                        : "375px",
                    height: "100%",
                    border: "none",
                    display: "block",
                  }}
                />
              );
            })()}
          </ErrorBoundaryFrame>
        )}
      </div>
    </div>
  );
}
