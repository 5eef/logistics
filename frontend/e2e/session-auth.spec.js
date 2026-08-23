import { expect, test } from "@playwright/test";

test("session login and logout never persist a bearer token", async ({ page }) => {
  let authenticated = false;
  const user = {
    id: 10,
    name: "Alice Test",
    email: "alice@example.test",
    phone: "0612345678",
    role: "expediteur",
    city: "Casablanca",
    is_verified: true,
    verification_status: "approved",
  };

  await page.route("http://127.0.0.1:8000/sanctum/csrf-cookie", async (route) => {
    await route.fulfill({ status: 204, headers: { "Set-Cookie": "XSRF-TOKEN=test-token; Path=/" } });
  });
  await page.route("http://127.0.0.1:8000/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/auth/login") {
      authenticated = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user }) });
      return;
    }
    if (path === "/api/auth/logout") {
      authenticated = false;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "ok" }) });
      return;
    }
    if (path === "/api/auth/me") {
      await route.fulfill({ status: authenticated ? 200 : 401, contentType: "application/json", body: JSON.stringify(authenticated ? user : { error: "Non authentifié" }) });
      return;
    }
    if (path === "/api/misc/cities") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(["Casablanca", "Rabat"]) });
      return;
    }
    if (path === "/api/colis/stats") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 0, pending: 0, in_transit: 0, delivered: 0, failed: 0, revenue: "0.00" }) });
      return;
    }
    if (path === "/api/colis" || path === "/api/tickets" || path === "/api/auth/notifications") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.goto("/auth");
  await page.getByLabel("Email *").fill("alice@example.test");
  await page.getByLabel("Mot de passe *").fill("Password1234");
  await page.locator("form").getByRole("button", { name: "SE CONNECTER", exact: true }).click();
  await expect(page).toHaveURL(/\/expediteur$/);
  expect(await page.evaluate(() => localStorage.getItem("logistics_token"))).toBeNull();

  await page.getByRole("button", { name: /Alice Test/ }).click();
  await page.getByRole("button", { name: /Déconnexion/ }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => localStorage.getItem("logistics_token"))).toBeNull();
});
