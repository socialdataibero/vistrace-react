"use client";

import { useEffect, useRef, useState } from "react";
import {
  FiUser,
  FiLogOut,
  FiX,
  FiLoader,
  FiCheck,
  FiAlertCircle,
  FiDatabase,
} from "react-icons/fi";
import { useAuthStore, userFromToken, type AuthUser } from "@/stores/authStore";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";
const IBERO_DATA_URL = process.env.NEXT_PUBLIC_IBERO_DATA_URL ?? "http://localhost:4200";

function initials(user: AuthUser | null): string {
  const base = user?.name?.trim() || user?.username?.trim() || "?";
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function roleLabel(role?: string): string {
  if (!role) return "Usuario";
  return role.toLowerCase() === "admin" ? "Administrador" : "Usuario";
}

export default function UserMenu() {
  const token = useAuthStore((s) => s.token);
  const storedUser = useAuthStore((s) => s.user);
  const source = useAuthStore((s) => s.source);
  const setUser = useAuthStore((s) => s.setUser);
  const clearToken = useAuthStore((s) => s.clearToken);

  const user = storedUser ?? (token ? userFromToken(token) : null);
  const isIbero = source === "ibero";

  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [nameDraft, setNameDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function openProfile() {
    setNameDraft(user?.name ?? "");
    setSaveMsg(null);
    setProfileOpen(true);
    setOpen(false);
  }

  async function handleSaveName() {
    if (!token || isIbero) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`${API_BASE}/users/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: nameDraft.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        name?: string;
        username?: string;
        role?: string;
        email?: string;
        message?: string[];
      };
      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message[0] : "No se pudo guardar";
        throw new Error(String(msg));
      }
      setUser({
        username: data.username ?? user?.username ?? "",
        name: data.name,
        email: data.email,
        role: data.role ?? user?.role,
      });
      setSaveMsg({ kind: "ok", text: "Perfil actualizado" });
    } catch (err) {
      setSaveMsg({
        kind: "error",
        text: err instanceof Error ? err.message : "Error al guardar",
      });
    } finally {
      setSaving(false);
    }
  }

  function handleLogout() {
    clearToken();
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
    }
    window.location.replace(window.location.pathname);
  }

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          title={user?.name || user?.username || "Cuenta"}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-teal-700 text-sm font-bold text-white shadow-md ring-2 ring-white transition hover:scale-105 hover:shadow-lg"
        >
          {initials(user)}
        </button>

        {open && (
          <div className="absolute right-0 top-12 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.16)]">
            {/* User info header */}
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="truncate text-sm font-semibold text-slate-800">
                {user?.name || user?.username || "Usuario"}
              </p>
              {user?.username && (
                <p className="truncate text-xs text-slate-400">@{user.username}</p>
              )}
              <div className="mt-2 flex items-center gap-1.5">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                  {roleLabel(user?.role)}
                </span>
                {isIbero && (
                  <span className="flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">
                    <FiDatabase size={9} />
                    Ibero Data
                  </span>
                )}
              </div>
            </div>

            <div className="p-1.5">
              <button
                onClick={openProfile}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <FiUser size={15} className="text-slate-400" />
                Mi perfil
              </button>
              {isIbero && (
                <a
                  href={IBERO_DATA_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                >
                  <FiDatabase size={15} className="text-slate-400" />
                  Ir a Ibero Data
                </a>
              )}
              <div className="mx-2 my-1 h-px bg-slate-100" />
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
              >
                <FiLogOut size={15} />
                Cerrar sesión
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Profile modal */}
      {profileOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setProfileOpen(false);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-7 shadow-2xl">
            <div className="mb-5 flex items-start justify-between">
              <h2 className="text-lg font-bold text-slate-800">Mi perfil</h2>
              <button
                onClick={() => setProfileOpen(false)}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Cerrar"
              >
                <FiX size={18} />
              </button>
            </div>

            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-teal-700 text-xl font-bold text-white">
                {initials(user)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-slate-800">
                  {user?.name || user?.username}
                </p>
                <p className="truncate text-sm text-slate-400">@{user?.username}</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    {roleLabel(user?.role)}
                  </span>
                  {isIbero && (
                    <span className="flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">
                      <FiDatabase size={9} />
                      Cuenta Ibero Data
                    </span>
                  )}
                </div>
              </div>
            </div>

            {isIbero ? (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
                Tu cuenta se administra desde Ibero Data. Para cambiar tu
                nombre o contraseña, hazlo desde tu perfil en Ibero Data.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="profile-name" className="text-xs font-semibold text-slate-600">
                    Nombre
                  </label>
                  <input
                    id="profile-name"
                    type="text"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    placeholder="Tu nombre"
                    className="rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
                  />
                </div>

                {saveMsg && (
                  <div
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                      saveMsg.kind === "ok"
                        ? "bg-teal-50 text-teal-700"
                        : "bg-red-50 text-red-600"
                    }`}
                  >
                    {saveMsg.kind === "ok" ? <FiCheck size={13} /> : <FiAlertCircle size={13} />}
                    {saveMsg.text}
                  </div>
                )}

                <button
                  onClick={() => void handleSaveName()}
                  disabled={saving || !nameDraft.trim()}
                  className="flex items-center justify-center gap-2 rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving && <FiLoader size={13} className="animate-spin" />}
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
