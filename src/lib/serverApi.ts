import { apiFetch } from "@/lib/session";
import { getToken } from '@/stores/authStore';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';

export interface ServerFileInfo {
  originalName: string;
  filename: string;
  size: number;
  mimetype: string;
  uploadedAt: string;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function uploadFileToServer(file: File): Promise<ServerFileInfo> {
  const body = new FormData();
  body.append('file', file);

  const res = await apiFetch(`${API_BASE}/files/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body,
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error((payload as { message?: string }).message ?? `Error ${res.status}`);
  }

  return res.json() as Promise<ServerFileInfo>;
}

export async function uploadFilesToServer(files: File[]): Promise<ServerFileInfo[]> {
  const body = new FormData();
  files.forEach((f) => body.append('files', f));

  const res = await apiFetch(`${API_BASE}/files/upload-many`, {
    method: 'POST',
    headers: authHeaders(),
    body,
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error((payload as { message?: string }).message ?? `Error ${res.status}`);
  }

  return res.json() as Promise<ServerFileInfo[]>;
}

export async function listServerFiles(): Promise<ServerFileInfo[]> {
  const res = await apiFetch(`${API_BASE}/files`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json() as Promise<ServerFileInfo[]>;
}

export async function deleteServerFile(filename: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/files/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
}
