export const COLORS = {
  navy: { base: "#0F1419", 900: "#131A21", 800: "#1A2332", 700: "#243044", 600: "#2D3B4E" },
  slate: { 400: "#8899AA", 500: "#6B7D8D", 600: "#4A5B6B" },
  cyan: { accent: "#5BC8F0", hover: "#7DD6F5", muted: "#2A5A6B" },
  status: { success: "#4ADE80", warning: "#FBBF24", error: "#F87171" },
} as const;

export const TYPOGRAPHY = {
  fontDisplay: '"Share Tech Mono", monospace',
  fontMono: '"JetBrains Mono", monospace',
  sizes: { xs: "10px", sm: "12px", base: "14px", lg: "18px" },
  weights: { regular: 400, bold: 700 },
} as const;

export const SPACING = {
  0: "0px", 1: "4px", 2: "8px", 4: "16px", 6: "24px", 8: "32px", 10: "40px", 12: "48px",
} as const;

// Panel default sizes (percentage at 1440px reference) — legacy, kept for PanelShell reference
export const PANEL_DEFAULTS = {
  sidebar: 14, milestone: 22, sliceDetail: 19, activeTask: 21, chat: 24,
} as const;

// Layout defaults for sidebar + tab navigation
export const LAYOUT_DEFAULTS = {
  sidebarWidth: 220,
  sidebarCollapsedWidth: 48,
  tabBarHeight: 40,
} as const;
