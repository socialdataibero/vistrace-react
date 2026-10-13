"use client";

import { useState } from "react";
import { FiEye, FiEyeOff, FiAlertCircle, FiLoader, FiCheckCircle } from "react-icons/fi";
import { useAuthStore, type AuthUser } from "@/stores/authStore";
import RegisterPage from "./RegisterPage";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

export function LogoMark() {
  return (
    <svg width="52" height="52" viewBox="0 0 40 40" fill="none" aria-hidden>
      <path
        d="M11 13 C 18 13, 15 27, 22 27 M11 27 C 18 27, 15 13, 22 13 M22 13 L 30 20 M22 27 L 30 20"
        stroke="#99f6e4"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="11" cy="13" r="4.5" fill="#14b8a6" />
      <circle cx="11" cy="27" r="4.5" fill="#2dd4bf" />
      <circle cx="22" cy="13" r="4" fill="#0d9488" />
      <circle cx="22" cy="27" r="4" fill="#0d9488" />
      <circle cx="31" cy="20" r="5" fill="#0f766e" />
    </svg>
  );
}

export default function LoginPage() {
  const setSession = useAuthStore((s) => s.setSession);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRegisterSuccess(false);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/sign-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { message?: string }).message ?? "Credenciales incorrectas");
      }
      const token = (data as { token?: string; access_token?: string }).token
        ?? (data as { access_token?: string }).access_token;
      if (!token) throw new Error("El servidor no devolvió un token");
      const user = (data as { user?: AuthUser }).user ?? null;
      setSession(token, user, "local");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  if (showRegister) {
    return (
      <RegisterPage
        onBack={() => setShowRegister(false)}
        onSuccess={() => {
          setShowRegister(false);
          setRegisterSuccess(true);
        }}
      />
    );
  }

  return (
    <div className="canvas-bg relative flex h-screen w-screen items-center justify-center overflow-hidden">
      {/* Glow decorativo detrás de la tarjeta */}
      <div
        aria-hidden
        className="pointer-events-none absolute h-[480px] w-[480px] rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(20,184,166,0.18), transparent 60%), radial-gradient(circle at 70% 70%, rgba(139,92,246,0.12), transparent 60%)",
        }}
      />

      <div className="relative w-full max-w-md px-6">
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-10 shadow-[0_18px_50px_rgba(15,23,42,0.12)] backdrop-blur-sm">
          {/* Marca */}
          <div className="mb-9 flex flex-col items-center gap-4 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 to-white shadow-sm">
              <LogoMark />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-800">VizCanvas</h1>
              <p className="mt-1.5 text-sm text-slate-400">
                Análisis de datos visual — conecta, transforma, visualiza
              </p>
            </div>
          </div>

          {registerSuccess && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
              <FiCheckCircle size={17} className="mt-0.5 flex-shrink-0 text-teal-600" />
              <span>
                <strong>Cuenta creada con éxito.</strong> Inicia sesión con tu
                usuario y contraseña.
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label htmlFor="login-username" className="text-sm font-semibold text-slate-600">
                Usuario
              </label>
              <input
                id="login-username"
                type="text"
                placeholder="tu.usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                className="rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-base text-slate-800 placeholder:text-slate-300 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
                required
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="login-password" className="text-sm font-semibold text-slate-600">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 pr-12 text-base text-slate-800 placeholder:text-slate-300 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                >
                  {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                <FiAlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-teal-600 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-teal-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <FiLoader size={16} className="animate-spin" />}
              {loading ? "Entrando..." : "Entrar"}
            </button>

            <p className="text-center text-sm text-slate-500">
              ¿No tienes cuenta?{" "}
              <button
                type="button"
                onClick={() => setShowRegister(true)}
                className="font-semibold text-teal-600 transition hover:text-teal-800"
              >
                Regístrate
              </button>
            </p>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Carga tus datos, conecta nodos y genera visualizaciones en segundos.
        </p>
      </div>
    </div>
  );
}
