"use client";

import { useEffect, useState, useRef } from "react";
import { useDataStore } from "@/stores/dataStore";

export function useDuckDB(options?: { skip?: boolean }) {
  const skip = options?.skip ?? false;
  const initialized = useDataStore((s) => s.initialized);
  const loading = useDataStore((s) => s.loading);
  const error = useDataStore((s) => s.error);
  const initialize = useDataStore((s) => s.initialize);
  const [ready, setReady] = useState(false);
  const initRef = useRef(false);

  useEffect(() => {
    if (skip) {
      return;
    }
    if (initRef.current) return;
    initRef.current = true;
    initialize()
      .then(() => setReady(true))
      .catch((err) => {
        console.error("[useDuckDB] Initialization failed:", err);
        initRef.current = false;
      });
  }, [initialize, skip]);

  return { ready: skip ? true : ready && initialized, loading, error };
}
