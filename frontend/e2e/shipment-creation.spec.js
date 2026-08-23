import { expect, test } from "@playwright/test";

test("shipment creation uses a server quote and never submits a client price", async ({ page }) => {
  let submittedPayload;
  const user = {
    id: 11,
    name: "Expéditeur Test",
    email: "sender@example.test",
    phone: "0612345678",
    role: "expediteur",
    city: "Casablanca",
    is_verified: true,
    verification_status: "approved",
  };

  await page.route("http://127.0.0.1:8000/sanctum/csrf-cookie", (route) => route.fulfill({ status: 204 }));
  await page.route("http://127.0.0.1:8000/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path === "/api/auth/me") return route.fulfill({ json: user });
    if (path === "/api/misc/cities") return route.fulfill({ json: ["Casablanca", "Rabat"] });
    if (path === "/api/colis/stats") {
      return route.fulfill({ json: { total: 0, pending: 0, in_transit: 0, delivered: 0, failed: 0, revenue: "0.00" } });
    }
    if ((path === "/api/colis" || path === "/api/tickets" || path === "/api/auth/notifications") && method === "GET") {
      return route.fulfill({ json: { data: [] } });
    }
    if (path === "/api/colis/quote" && method === "POST") {
      return route.fulfill({ json: { amount: "67.50", currency: "MAD" } });
    }
    if (path === "/api/colis" && method === "POST") {
      submittedPayload = request.postDataJSON();
      return route.fulfill({
        status: 201,
        json: {
          id: 501,
          tracking_id: "LOGABC123456789",
          status: "pending",
          from_city: "Casablanca",
          to_city: "Rabat",
          price: "67.50",
          pin_code: "4821",
          estimated_delivery: "2026-08-25T12:00:00Z",
        },
      });
    }
    return route.fulfill({ status: 404, json: {} });
  });

  await page.goto("/expediteur");
  await page.getByRole("button", { name: /Nouvelle Expédition/ }).click();
  await page.getByLabel("Adresse d'expédition *").fill("1 rue A");
  await page.getByLabel("Adresse de livraison *").fill("2 rue B");
  await page.getByLabel("Nom du destinataire *").fill("Destinataire Test");
  await page.getByLabel("Téléphone destinataire *").fill("0699999999");
  await page.getByRole("button", { name: /Suivant/ }).click();
  await page.getByLabel("Poids (kg) *").fill("1.5");

  await expect(page.getByLabel("Prix calculé (MAD)")).toHaveValue("67.50 MAD");
  await expect(page.getByLabel("Prix calculé (MAD)")).toHaveAttribute("readonly", "");
  await page.getByRole("button", { name: /Créer l'Expédition/ }).click();

  await expect(page.getByRole("heading", { name: "Expédition Créée!" })).toBeVisible();
  await expect(page.getByText("LOGABC123456789", { exact: true })).toBeVisible();
  expect(submittedPayload.price).toBeUndefined();
  expect(submittedPayload.client_request_id).toMatch(/^[0-9a-f-]{36}$/i);
});
