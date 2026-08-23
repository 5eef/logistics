import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, camelToSnake, collectionPage, snakeToCamel } from "./api";

describe("API client", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("converts nested payload keys between the API and the UI", () => {
    expect(camelToSnake({ trackingId: "LOG1", recipient: { phoneNumber: "0600000000" } }))
      .toEqual({ tracking_id: "LOG1", recipient: { phone_number: "0600000000" } });
    expect(snakeToCamel({ tracking_id: "LOG1", status_history: [{ created_at: "today" }] }))
      .toEqual({ trackingId: "LOG1", statusHistory: [{ createdAt: "today" }] });
  });

  it("sends a tracking request and exposes camel-cased data", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tracking_id: "LOG2024ABC", status_history: [] }),
    });

    await expect(api.colis.track("LOG2024ABC")).resolves.toEqual({
      trackingId: "LOG2024ABC",
      statusHistory: [],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/colis/track/LOG2024ABC",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("initializes CSRF and logs in with cookies without an Authorization header", async () => {
    document.cookie = "XSRF-TOKEN=test-token; path=/";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { id: 1, role: "expediteur" } }),
      });

    await expect(api.auth.login("USER@EXAMPLE.TEST", "Password1234")).resolves.toEqual({
      user: { id: 1, role: "expediteur" },
    });
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/sanctum/csrf-cookie");
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({
      credentials: "include",
      headers: expect.not.objectContaining({ Authorization: expect.anything() }),
    }));
  });

  it.each([21, 50, 121])("preserves pagination metadata for %i records", (total) => {
    const data = Array.from({ length: Math.min(total, 50) }, (_, id) => ({ id: id + 1 }));
    expect(collectionPage({
      data,
      meta: { currentPage: 1, lastPage: Math.ceil(total / 50), perPage: 50, total },
      links: { next: total > 50 ? "?page=2" : null },
    })).toEqual({
      data,
      meta: { currentPage: 1, lastPage: Math.ceil(total / 50), perPage: 50, total },
      links: { next: total > 50 ? "?page=2" : null },
    });
  });
});
