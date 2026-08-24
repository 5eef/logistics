import { test, expect } from "@playwright/test";

const apiOrigin = process.env.STAGING_API_URL || "https://api.logistics.local";
const frontendOrigin = process.env.STAGING_FRONTEND_URL || "https://logistics.local";
const password = process.env.STAGING_TEST_PASSWORD;

test.skip(process.env.STAGING_EXPECT_POLLING_FALLBACK !== "true", "Run only while Reverb is intentionally stopped");

async function mutate(context, method, path, data) {
  const csrfResponse = await context.request.get(`${apiOrigin}/sanctum/csrf-cookie`, {
    headers: { Accept: "application/json", Origin: frontendOrigin },
  });
  expect(csrfResponse.status()).toBe(204);
  const token = (await context.cookies()).find((cookie) => cookie.name === "XSRF-TOKEN");
  expect(token).toBeTruthy();
  return context.request.fetch(`${apiOrigin}${path}`, {
    method,
    data,
    headers: {
      Accept: "application/json",
      Origin: frontendOrigin,
      "X-XSRF-TOKEN": decodeURIComponent(token.value),
    },
  });
}

test("notification polling fallback works while Reverb is stopped", async ({ browser }) => {
  expect(password, "STAGING_TEST_PASSWORD must be supplied by the runner").toBeTruthy();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const login = await mutate(context, "POST", "/api/auth/login", {
      email: "staging.sender@example.test",
      password,
    });
    expect(login.status()).toBe(200);

    const page = await context.newPage();
    await page.goto("/expediteur");
    await expect(page.getByText("Staging Sender")).toBeVisible();
    await page.waitForTimeout(2_000);

    const suffix = `${Date.now()}`.slice(-8);
    const created = await mutate(context, "POST", "/api/colis", {
      client_request_id: crypto.randomUUID(),
      from_address: "300 Fictitious Fallback Street",
      to_address: "400 Fictitious Recovery Avenue",
      from_city: "Casablanca",
      to_city: "Casablanca",
      recipient_name: "Staging Recipient",
      recipient_phone: "+212600000102",
      weight: "1.250",
      description: `Fictitious fallback probe ${suffix}`,
      is_voyageur_eligible: false,
    });
    expect(created.status()).toBe(201);
    const shipment = await created.json();

    await page.getByRole("button", { name: "Ouvrir les notifications" }).click();
    await expect(page.getByText(new RegExp(shipment.tracking_id))).toBeVisible({ timeout: 45_000 });
  } finally {
    await context.close();
  }
});
