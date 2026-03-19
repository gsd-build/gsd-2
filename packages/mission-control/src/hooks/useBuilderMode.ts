/**
 * useBuilderMode — hook that reads InterfaceModeContext.
 *
 * Returns { builderMode, vocab } from the nearest InterfaceModeProvider.
 * Falls back to context defaults (builderMode=false, DEVELOPER_VOCAB) when
 * no provider is present — safe to call from any component.
 */
import { useContext } from "react";
import { InterfaceModeContext } from "../context/InterfaceModeContext";

export function useBuilderMode() {
  return useContext(InterfaceModeContext);
}
