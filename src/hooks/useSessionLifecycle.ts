"use client";

import { useEffect, useState } from "react";
import { forgetLocalSession, getToken, isTokenUsable } from "@/stores/authStore";
import { forgetLocalIbero } from "@/stores/iberoStore";
import { endLocalSession, endSession, SESSION_EXPIRED_MESSAGE } from "@/lib/session";

export function useSessionLifecycle(): boolean {
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("handoff")) {
      if (sessionStorage.getItem("vistrace-login-required")) {
        forgetLocalSession();
        forgetLocalIbero();
      }
      const token = getToken();
      if (token && !isTokenUsable(token)) {
        endSession(SESSION_EXPIRED_MESSAGE);
        return;
      }
    }
    queueMicrotask(() => setChecked(true));
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== localStorage) return;
      if (event.key !== "vistrace-auth" && event.key !== null) return;
      try {
        const incoming = event.newValue ? JSON.parse(event.newValue)?.state?.token : null;
        if (getToken() && incoming !== getToken()) {
          endLocalSession("La sesión cambió en otra pestaña. Inicia sesión de nuevo.");
        }
      } catch {
        endLocalSession(SESSION_EXPIRED_MESSAGE);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return checked;
}
