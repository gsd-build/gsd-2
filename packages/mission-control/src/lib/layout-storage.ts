import type { LayoutStorage } from "react-resizable-panels";

export function createSessionStorage(): LayoutStorage {
  return {
    getItem(name: string): string | null {
      return localStorage.getItem(name);
    },
    setItem(name: string, value: string): void {
      localStorage.setItem(name, value);
    },
  };
}
