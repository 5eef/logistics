import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import ResetPassword from "./ResetPassword";

vi.mock("../lib/api", () => ({ api: { auth: { resetPassword: vi.fn() } } }));
import { api } from "../lib/api";

describe("ResetPassword", () => {
  beforeEach(() => vi.clearAllMocks());

  it("validates confirmation and submits token, email, and both password fields", async () => {
    window.history.pushState({}, "", "/reset-password?token=abc123&email=user%40example.test");
    const { hook } = memoryLocation({ path: "/reset-password?token=abc123&email=user%40example.test" });
    api.auth.resetPassword.mockResolvedValue({ message: "Mot de passe réinitialisé." });
    render(<Router hook={hook}><ResetPassword /></Router>);

    fireEvent.change(screen.getByLabelText("Mot de passe"), { target: { value: "NewPassword123" } });
    fireEvent.change(screen.getByLabelText("Confirmer le mot de passe"), { target: { value: "different123" } });
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser le mot de passe" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ne correspondent pas");

    fireEvent.change(screen.getByLabelText("Confirmer le mot de passe"), { target: { value: "NewPassword123" } });
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser le mot de passe" }));
    await waitFor(() => expect(api.auth.resetPassword).toHaveBeenCalledWith({
      token: "abc123", email: "user@example.test", password: "NewPassword123", passwordConfirmation: "NewPassword123",
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("Mot de passe réinitialisé");
  });
});
