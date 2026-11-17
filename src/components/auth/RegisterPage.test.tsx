import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import RegisterPage from "./RegisterPage";

afterEach(() => vi.unstubAllGlobals());

it("rejects an email-shaped local username before sending a registration request", () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  render(<RegisterPage onBack={vi.fn()} onSuccess={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "user@example.test" } });
  fireEvent.submit(screen.getByRole("button", { name: "Crear cuenta" }).closest("form")!);
  expect(screen.getByText(/El usuario no puede contener @/)).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});
