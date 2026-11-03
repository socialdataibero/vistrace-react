"use client";

import { useState } from "react";
import { FiEye, FiEyeOff, FiAlertCircle, FiLoader, FiArrowLeft } from "react-icons/fi";
import { LogoMark } from "./LoginPage";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

const ERROR_MESSAGES: Record<string, string> = {
  USERNAME_ALREADY_EXISTS: "Ese usuario ya existe, elige otro",
  VALIDATION_ERROR: "Revisa los datos ingresados",
  ERROR_CREATING_USER: "No se pudo crear la cuenta, intenta de nuevo",
};

function translateError(raw: unknown): string {
  const code = Array.isArray(raw) ? String(raw[0]) : String(raw ?? "");
  return ERROR_MESSAGES[code] ?? code ?? "Error al crear la cuenta";
}

export default function RegisterPage({
  onBack,
  onSuccess,
}: {
  onBack: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanUsername = username.trim().toLowerCase();
    if (/\s/.test(cleanUsername)) {
      setError("El usuario no puede contener espacios");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), username: cleanUsername, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(translateError((data as { message?: unknown }).message));
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear la cuenta");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-base text-slate-800 placeholder:text-slate-300 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10";

  return (
    <div className="canvas-bg relative flex h-screen w-screen items-center justify-center overflow-hidden">
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
          <div className="mb-8 flex flex-col items-center gap-4 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 to-white shadow-sm">
              <LogoMark />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-800">Crear cuenta</h1>
              <p className="mt-1.5 text-sm text-slate-400">
                Únete a vistrace y empieza a analizar tus datos
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label htmlFor="reg-name" className="text-sm font-semibold text-slate-600">
                Nombre
              </label>
              <input
                id="reg-name"
                type="text"
                placeholder="Tu nombre completo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                className={inputClass}
                required
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="reg-username" className="text-sm font-semibold text-slate-600">
                Usuario
              </label>
              <input
                id="reg-username"
                type="text"
                placeholder="tu.usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                className={inputClass}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="reg-password" className="text-sm font-semibold text-slate-600">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="reg-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className={`${inputClass} w-full pr-12`}
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

            <div className="flex flex-col gap-2">
              <label htmlFor="reg-confirm" className="text-sm font-semibold text-slate-600">
                Confirmar contraseña
              </label>
              <input
                id="reg-confirm"
                type={showPassword ? "text" : "password"}
                placeholder="Repite tu contraseña"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className={inputClass}
                required
              />
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
              {loading ? "Creando cuenta..." : "Crear cuenta"}
            </button>

            <button
              type="button"
              onClick={onBack}
              className="flex items-center justify-center gap-2 text-sm font-medium text-slate-500 transition hover:text-teal-700"
            >
              <FiArrowLeft size={15} />
              ¿Ya tienes cuenta? Inicia sesión
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
