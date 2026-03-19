/**
 * Web Search Extension v4
 *
 * Native Anthropic hooks stay eager. Heavy tool registration is deferred in
 * interactive mode so startup is not blocked on the full search tool stack.
 */

import { importExtensionModule, type ExtensionAPI } from "@gsd/pi-coding-agent";
import { registerSearchProviderCommand } from "./command-search-provider.js";
import { registerNativeSearchHooks } from "./native-search.js";

let toolsPromise: Promise<void> | null = null;

async function registerSearchTools(pi: ExtensionAPI): Promise<void> {
  if (!toolsPromise) {
    toolsPromise = (async () => {
      const [{ registerSearchTool }, { registerFetchPageTool }, { registerLLMContextTool }] = await Promise.all([
        importExtensionModule<typeof import("./tool-search.js")>(import.meta.url, "./tool-search.js"),
        importExtensionModule<typeof import("./tool-fetch-page.js")>(import.meta.url, "./tool-fetch-page.js"),
        importExtensionModule<typeof import("./tool-llm-context.js")>(import.meta.url, "./tool-llm-context.js"),
      ]);
      registerSearchTool(pi);
      registerFetchPageTool(pi);
      registerLLMContextTool(pi);
    })().catch((error) => {
      // Cache the rejection instead of resetting to null — prevents concurrent
      // re-initialization race condition (#gap-analysis C3).
      toolsPromise = Promise.reject(error);
      toolsPromise.catch(() => {});
      throw error;
    });
  }

  return toolsPromise;
}

export default function (pi: ExtensionAPI) {
  registerSearchProviderCommand(pi);
  registerNativeSearchHooks(pi);

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.hasUI) {
      void registerSearchTools(pi).catch((error) => {
        ctx.ui.notify(`search-the-web failed to load: ${error instanceof Error ? error.message : String(error)}`, "warning");
      });
      return;
    }

    try {
      await registerSearchTools(pi);
    } catch (error) {
      process.stderr.write(`search-the-web: load error in non-TTY mode — ${error instanceof Error ? error.message : String(error)}\n`);
    }
  });
}
