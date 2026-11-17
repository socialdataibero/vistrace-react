import { afterEach, describe, expect, it, vi } from "vitest";
import { executeQuery, importTableData } from "./duckdb";
import { useAuthStore } from "@/stores/authStore";
import { sessionToken } from "@/test/iberoFixtures";

afterEach(() => vi.unstubAllGlobals());

describe("server contract errors", () => {
  it.each([403, 400])("shows query rejection messages without invalidating a valid session (%s)", async (status) => {
    const token = sessionToken("a");
    useAuthStore.getState().setSession(token, { username: "a" }, "local");
    const message = status === 403 ? "No tienes acceso a la tabla private_data" : "Solo se permiten consultas SELECT";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message }), { status })));
    await expect(executeQuery("SELECT * FROM private_data")).rejects.toThrow(message);
    expect(useAuthStore.getState().token).toBe(token);
  });

  it("shows an import ownership conflict instead of treating it as a successful import", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "La tabla pertenece a otro usuario" }), { status: 409 })));
    await expect(importTableData("private_data", [], [])).rejects.toThrow("La tabla pertenece a otro usuario");
  });
});
