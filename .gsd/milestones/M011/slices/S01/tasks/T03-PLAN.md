---
estimated_steps: 5
estimated_files: 4
---

# T03: Install prompt hook, UI component, and browser verification

**Slice:** S01 — PWA Install Prompt with Serwist
**Milestone:** M011

## Description

Create the `beforeinstallprompt` hook and install prompt UI that lets users install GSD as a desktop app. Then verify the full PWA stack (service worker + manifest + install prompt) works end-to-end by building production, running the web host, and checking in a real browser.

**Skill note:** The executor should load the `frontend-design` skill for the install prompt UI component — it must match the existing GSD design system (oklch tokens, dark theme default, existing component patterns).

## Steps

1. Create `web/hooks/use-install-prompt.ts`:
   ```typescript
   "use client";

   import { useState, useEffect, useCallback } from "react";

   interface BeforeInstallPromptEvent extends Event {
     prompt(): Promise<void>;
     userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
   }

   export function useInstallPrompt() {
     const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
     const [isInstalled, setIsInstalled] = useState(false);

     useEffect(() => {
       // Check if already installed (standalone mode)
       if (window.matchMedia("(display-mode: standalone)").matches) {
         setIsInstalled(true);
         return;
       }

       const handler = (e: Event) => {
         e.preventDefault();
         setDeferredPrompt(e as BeforeInstallPromptEvent);
       };

       const installedHandler = () => {
         setIsInstalled(true);
         setDeferredPrompt(null);
       };

       window.addEventListener("beforeinstallprompt", handler);
       window.addEventListener("appinstalled", installedHandler);

       return () => {
         window.removeEventListener("beforeinstallprompt", handler);
         window.removeEventListener("appinstalled", installedHandler);
       };
     }, []);

     const promptInstall = useCallback(async () => {
       if (!deferredPrompt) return false;
       await deferredPrompt.prompt();
       const { outcome } = await deferredPrompt.userChoice;
       setDeferredPrompt(null);
       return outcome === "accepted";
     }, [deferredPrompt]);

     return {
       canInstall: !!deferredPrompt && !isInstalled,
       isInstalled,
       promptInstall,
     };
   }
   ```

2. Create `web/components/gsd/install-prompt-banner.tsx`:
   Build a tasteful, dismissible install prompt component. Design requirements:
   - Appears only when `canInstall` is true (hook provides this)
   - Positioned unobtrusively — a small floating banner at the bottom of the viewport or a button in the app shell header area
   - Uses the existing design system: oklch CSS variables, Tailwind utilities, existing UI component patterns (check `web/components/ui/` for Button, etc.)
   - Has a dismiss/close button that hides it for the session (use state, not localStorage — prompt should reappear on next visit)
   - Install button triggers `promptInstall()` from the hook
   - Shows nothing when already installed or when browser doesn't support PWA install
   - Animates in/out smoothly (the project uses `motion` library — see package.json)
   
   Example structure:
   ```tsx
   "use client";

   import { useState } from "react";
   import { useInstallPrompt } from "@/hooks/use-install-prompt";
   import { Button } from "@/components/ui/button";
   import { X, Download } from "lucide-react";
   import { AnimatePresence, motion } from "motion/react";

   export function InstallPromptBanner() {
     const { canInstall, promptInstall } = useInstallPrompt();
     const [dismissed, setDismissed] = useState(false);

     if (!canInstall || dismissed) return null;

     return (
       <AnimatePresence>
         <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           exit={{ opacity: 0, y: 20 }}
           className={/* bottom-positioned banner with dark theme styling */}
         >
           {/* Icon + "Install GSD" text + Install button + Dismiss X button */}
         </motion.div>
       </AnimatePresence>
     );
   }
   ```
   Reference existing component patterns in `web/components/gsd/` for the visual style. The banner should feel native to the GSD UI.

3. Wire `InstallPromptBanner` into the app shell:
   Open `web/components/gsd/app-shell.tsx` and add the `<InstallPromptBanner />` component. Place it at the end of the shell (after main content) so it overlays at the bottom without pushing layout. Import from `@/components/gsd/install-prompt-banner`.

4. Build production and run the web host for browser verification:
   ```bash
   npm run build:web-host
   npm run gsd:web:stop:all 2>/dev/null || true
   npm run gsd:web
   ```
   Wait for the host to be ready, then open Chrome to the reported URL (typically http://localhost:3141 or similar).

5. Browser verification checklist (use browser tools to verify):
   - Open Chrome DevTools → Application tab
   - **Service Workers section:** Should show `sw.js` registered and activated
   - **Manifest section:** Should show the manifest loaded with name "GSD", 2 icons, display "standalone"
   - **Install prompt:** Chrome should show the install icon in the address bar (or the custom banner should appear if `beforeinstallprompt` fired)
   - Check browser console for `[GSD] Service worker registered:` log message
   - If install prompt doesn't appear, check Lighthouse PWA audit for what criteria are missing
   
   Note: `beforeinstallprompt` only fires after the page has been visited at least once with a registered service worker. May need to reload once. Also, Chrome requires the user to have "engaged" with the page (clicked/scrolled) before showing the prompt.

## Must-Haves

- [ ] `web/hooks/use-install-prompt.ts` captures `beforeinstallprompt` and exposes `canInstall`/`promptInstall`
- [ ] `web/components/gsd/install-prompt-banner.tsx` renders install UI when `canInstall` is true
- [ ] Banner is dismissible and disappears when already installed
- [ ] Banner wired into app-shell.tsx
- [ ] Full build succeeds: `npm run build:web-host` exits 0
- [ ] Browser verification: SW registered, manifest detected, install prompt available

## Verification

- `npm run build:web-host` exits 0
- Browser: DevTools → Application → Service Workers shows `sw.js` registered
- Browser: DevTools → Application → Manifest shows valid manifest
- Browser: Install prompt UI appears or Chrome address bar shows install icon
- Browser console shows `[GSD] Service worker registered:` message

## Observability Impact

- **Browser console:** `beforeinstallprompt` event capture logged implicitly by Chrome's PWA diagnostics. `[GSD] Service worker registered:` from T01's sw-register confirms SW prerequisite.
- **DevTools Application tab:** Service Workers panel shows sw.js status; Manifest panel shows parsed manifest with icons and display mode; installability status and missing criteria listed.
- **Install prompt visibility:** `canInstall` state in the hook tracks whether the browser fired `beforeinstallprompt`. Banner renders only when true — absence means the browser hasn't met criteria (needs engagement, SW registration, valid manifest).
- **Failure visibility:** If the banner never appears, check: (1) SW registration errors in console, (2) Manifest warnings in Application tab, (3) Lighthouse PWA audit for specific missing criteria. The hook silently degrades — no install UI shown when prerequisites unmet.

## Inputs

- T01 output: `web/app/sw.ts`, `web/app/sw-register.tsx` wired in layout, build script includes `serwist build`
- T02 output: `web/public/manifest.json`, icon PNGs, layout.tsx metadata with manifest link
- `web/components/gsd/app-shell.tsx` — existing app shell to wire the banner into
- `web/components/ui/button.tsx` — existing Button component for install button
- `web/hooks/` — existing hooks directory
- Project uses `motion` (framer-motion successor) for animations, `lucide-react` for icons

## Expected Output

- `web/hooks/use-install-prompt.ts` — new hook for PWA install prompt
- `web/components/gsd/install-prompt-banner.tsx` — new install prompt UI component
- `web/components/gsd/app-shell.tsx` — modified to include InstallPromptBanner
- Browser verification confirms: SW registered, manifest valid, install prompt available
