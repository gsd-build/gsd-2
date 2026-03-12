import { describe, expect, it, beforeEach } from "bun:test";
import { createSessionStorage } from "../src/lib/layout-storage";

// Simple localStorage mock for non-browser environment
const store = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
  get length() { return store.size; },
  key: (_index: number) => null as string | null,
};

// Install mock before importing storage
(globalThis as any).localStorage = localStorageMock;

describe("createSessionStorage", () => {
  beforeEach(() => {
    store.clear();
  });

  it("setItem writes to localStorage", () => {
    const storage = createSessionStorage();
    storage.setItem("test-key", "test-value");
    expect(store.get("test-key")).toBe("test-value");
  });

  it("getItem reads from localStorage", () => {
    store.set("existing-key", "existing-value");
    const storage = createSessionStorage();
    expect(storage.getItem("existing-key")).toBe("existing-value");
  });

  it("getItem returns null for missing key", () => {
    const storage = createSessionStorage();
    expect(storage.getItem("nonexistent")).toBeNull();
  });
});
