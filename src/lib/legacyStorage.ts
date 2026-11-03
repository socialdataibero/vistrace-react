// Browser data saved before the rename to vistrace lives under "vizcanvas-*" keys.
const LEGACY_KEYS = ["state", "snapshots", "uploaded-tables", "auth", "ibero"];

export function migrateLegacyStorage(storage: Storage): void {
  for (const suffix of LEGACY_KEYS) {
    const legacyKey = `vizcanvas-${suffix}`;
    const value = storage.getItem(legacyKey);
    if (value === null) continue;
    if (storage.getItem(`vistrace-${suffix}`) === null) storage.setItem(`vistrace-${suffix}`, value);
    storage.removeItem(legacyKey);
  }
}

if (typeof window !== "undefined") {
  try {
    migrateLegacyStorage(window.localStorage);
  } catch {
    // Storage can be blocked (private mode); the app works without the old data.
  }
}
