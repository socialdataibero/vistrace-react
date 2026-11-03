import { describe, expect, it } from "vitest";
import { migrateLegacyStorage } from "./legacyStorage";

function memoryStorage(initial: Record<string, string>): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe("migrateLegacyStorage", () => {
  it("moves legacy keys and keeps newer data", () => {
    const storage = memoryStorage({ "vizcanvas-state": "old", "vizcanvas-auth": "a", "vistrace-auth": "new" });
    migrateLegacyStorage(storage);
    expect(storage.getItem("vistrace-state")).toBe("old");
    expect(storage.getItem("vistrace-auth")).toBe("new");
    expect(storage.getItem("vizcanvas-state")).toBeNull();
    expect(storage.getItem("vizcanvas-auth")).toBeNull();
  });
});
