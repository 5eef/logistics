import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Home from "./Home";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: { colis: { track: vi.fn() } },
}));

describe("Home", () => {
  it("normalizes and displays a public tracking request", async () => {
    api.colis.track.mockResolvedValue({
      trackingId: "LOG2024ABC",
      status: "in_transit",
      fromCity: "Casablanca",
      toCity: "Rabat",
      estimatedDelivery: "2026-08-20T00:00:00.000Z",
      statusHistory: [],
    });
    const user = userEvent.setup();

    render(<Home />);
    expect(screen.getByRole("link", { name: "5eef" })).toHaveAttribute("href", "https://github.com/5eef");
    await user.type(screen.getByRole("textbox"), "log2024abc");
    await user.click(screen.getByRole("button", { name: "SUIVRE" }));

    expect(api.colis.track).toHaveBeenCalledWith("LOG2024ABC");
    expect(await screen.findByText("LOG2024ABC", { exact: true })).toBeInTheDocument();
  });
});
