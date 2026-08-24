import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Navbar from "./Navbar";
import { api } from "../lib/api";

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock("wouter", () => ({ useLocation: () => ["/admin", mockNavigate] }));
vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: 1, name: "Admin", role: "admin" }, logout: vi.fn() }),
}));
vi.mock("../lib/realtime", () => ({
  subscribeToUserNotifications: vi.fn(() => ({ disconnect: vi.fn() })),
}));
vi.mock("../lib/api", () => ({
  api: { auth: { notifications: vi.fn(), readNotification: vi.fn() } },
}));

describe("Navbar notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.auth.notifications.mockResolvedValue({
      data: [{ id: 7, title: "Compte approuvé", message: "Votre compte est prêt.", isRead: false, createdAt: "2026-08-24T10:00:00Z" }],
      meta: { currentPage: 1, lastPage: 1, perPage: 10, total: 1 },
    });
    api.auth.readNotification.mockResolvedValue({});
  });

  it("closes the notification panel when the user clicks elsewhere", async () => {
    const user = userEvent.setup();
    render(<Navbar />);
    await waitFor(() => expect(api.auth.notifications).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Ouvrir les notifications" }));
    expect(screen.getByText("Compte approuvé")).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByText("Compte approuvé")).not.toBeInTheDocument();
  });

  it("marks a notification as read and closes the panel", async () => {
    const user = userEvent.setup();
    render(<Navbar />);
    await waitFor(() => expect(api.auth.notifications).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Ouvrir les notifications" }));
    await user.click(screen.getByRole("button", { name: /Compte approuvé/ }));

    expect(api.auth.readNotification).toHaveBeenCalledWith(7);
    expect(screen.queryByText("Compte approuvé")).not.toBeInTheDocument();
  });
});
