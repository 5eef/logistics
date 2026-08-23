import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, camelToSnake, snakeToCamel } from "./api";

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
      expect.objectContaining({ method: "GET" }),
    );
  });
});
