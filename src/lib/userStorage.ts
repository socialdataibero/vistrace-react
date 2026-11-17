export function clearUserStorage(): void {
  if (typeof window === "undefined") return;
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of Object.keys(storage)) {
      if (key.startsWith("vistrace-") || key.startsWith("vizcanvas-")) storage.removeItem(key);
    }
  }
}
