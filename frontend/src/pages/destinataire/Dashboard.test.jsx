import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DestinataireDashboard from "./Dashboard";

const mockUser = vi.hoisted(() => ({ id: 10, name: "Destinataire", role: "destinataire" }));
const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock("wouter", () => ({ useLocation: () => ["/destinataire", mockNavigate] }));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser }),
}));
vi.mock("../../components/Navbar", () => ({ default: () => <div data-testid="navbar" /> }));
vi.mock("../../lib/api", () => ({
  api: {
    colis: {
      list: vi.fn(), stats: vi.fn(), track: vi.fn(), rate: vi.fn(),
    },
  },
}));
import { api } from "../../lib/api";

describe("DestinataireDashboard ratings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.colis.list.mockResolvedValue({
      data: [{
        id: 5, trackingId: "LOGTRAVELER1", status: "delivered", fromCity: "Casablanca", toCity: "Rabat",
        updatedAt: "2026-08-23T10:00:00Z", livreurId: null, voyageurId: 42,
      }],
      meta: { currentPage: 1, lastPage: 1, perPage: 20, total: 1 }, links: {},
    });
    api.colis.stats.mockResolvedValue({ total: 1, pending: 0, delivered: 1 });
    api.colis.rate.mockResolvedValue({ id: 1 });
  });

  it("submits a rating for the assigned traveler", async () => {
    render(<DestinataireDashboard />);
    const ratingButton = await screen.findByTitle("Noter le transporteur");
    fireEvent.click(ratingButton);
    fireEvent.click(screen.getByRole("button", { name: /Envoyer/ }));

    await waitFor(() => expect(api.colis.rate).toHaveBeenCalledWith(5, {
      toUserId: 42, score: 5, comment: "",
    }));
  });
});
