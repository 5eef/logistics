import { expect, test } from "@playwright/test";

test("the public tracking page and authentication entry point are available", async ({ page }) => {
  await page.route("**/api/colis/track/LOG2024ABC", (route) => route.fulfill({
    json: {
      tracking_id: "LOG2024ABC",
      status: "in_transit",
      from_city: "Casablanca",
      to_city: "Rabat",
      estimated_delivery: "2026-08-20T00:00:00.000Z",
      status_history: [],
    },
  }));

  await page.goto("/");
  await expect(page.getByText("SUIVI DE COLIS SANS COMPTE")).toBeVisible();
  await page.getByRole("textbox").fill("log2024abc");
  await page.getByRole("button", { name: "SUIVRE" }).click();
  await expect(page.getByText("LOG2024ABC", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /SE CONNECTER \/ S'INSCRIRE/ }).click();
  await expect(page).toHaveURL(/\/auth\?role=expediteur$/);
  await expect(page.locator("form").getByRole("button", { name: "SE CONNECTER", exact: true })).toBeVisible();
});
