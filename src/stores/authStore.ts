import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  username: string;
  name?: string;
  email?: string;
  role?: string;
}

export type AuthSource = 'local' | 'ibero';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  source: AuthSource | null;
  setToken: (token: string) => void;
  setSession: (token: string, user: AuthUser | null, source: AuthSource) => void;
  setUser: (user: AuthUser | null) => void;
  clearToken: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      source: null,
      setToken: (token) => set({ token }),
      setSession: (token, user, source) => set({ token, user, source }),
      setUser: (user) => set({ user }),
      clearToken: () => set({ token: null, user: null, source: null }),
    }),
    { name: 'vizcanvas-auth' },
  ),
);

export function getToken(): string | null {
  return useAuthStore.getState().token;
}

/** True si el JWT existe y no está expirado (sin validar la firma — eso lo hace el servidor). */
export function isTokenUsable(token: string | null): token is string {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { exp?: number };
    return typeof payload.exp !== 'number' || payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

// Fallback for sessions persisted before `user` existed in the store:
// the JWT payload carries { username, role }.
export function userFromToken(token: string): AuthUser | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as {
      username?: string;
      role?: string;
    };
    if (!payload.username) return null;
    return { username: payload.username, role: payload.role };
  } catch {
    return null;
  }
}
