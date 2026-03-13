import { native } from "../native.js";
import type { AstFindOptions, AstFindResult, AstReplaceOptions, AstReplaceResult, AstFindMatch, AstReplaceChange, AstReplaceFileChange } from "./types.js";

export type { AstFindMatch, AstFindOptions, AstFindResult, AstReplaceChange, AstReplaceFileChange, AstReplaceOptions, AstReplaceResult };

export function astGrep(options: AstFindOptions): AstFindResult {
  return (native as Record<string, Function>).astGrep(options) as AstFindResult;
}

export function astEdit(options: AstReplaceOptions): AstReplaceResult {
  return (native as Record<string, Function>).astEdit(options) as AstReplaceResult;
}
