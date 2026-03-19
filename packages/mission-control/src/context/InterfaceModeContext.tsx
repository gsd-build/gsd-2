/**
 * InterfaceModeContext — React Context for Builder/Developer mode propagation.
 *
 * BUILDER-01: Provides builderMode boolean and VocabMap to the entire component tree.
 * Consumed via useBuilderMode hook (see ../hooks/useBuilderMode.ts).
 *
 * Usage:
 *   <InterfaceModeProvider builderMode={builderMode}>
 *     <App />
 *   </InterfaceModeProvider>
 */
import { createContext } from "react";
import type React from "react";
import { DEVELOPER_VOCAB, BUILDER_VOCAB } from "../lib/builder-vocab";
import type { VocabMap } from "../lib/builder-vocab";

/** Context value shape. */
export interface InterfaceModeContextValue {
  builderMode: boolean;
  vocab: VocabMap;
}

/** Context with defaults — builderMode=false, vocab=DEVELOPER_VOCAB. */
export const InterfaceModeContext = createContext<InterfaceModeContextValue>({
  builderMode: false,
  vocab: DEVELOPER_VOCAB,
});

/** Provider that computes vocab from builderMode and supplies both to the tree. */
export function InterfaceModeProvider({
  children,
  builderMode,
}: {
  children: React.ReactNode;
  builderMode: boolean;
}) {
  const vocab = builderMode ? BUILDER_VOCAB : DEVELOPER_VOCAB;
  return (
    <InterfaceModeContext.Provider value={{ builderMode, vocab }}>
      {children}
    </InterfaceModeContext.Provider>
  );
}
