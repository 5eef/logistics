import { test, expect } from "@playwright/test";

const apiOrigin = process.env.STAGING_API_URL || "https://api.logistics.local";
const frontendOrigin = process.env.STAGING_FRONTEND_URL || "https://logistics.local";
const password = process.env.STAGING_TEST_PASSWORD;

async function csrf(context) {
  const response = await context.request.get(`${apiOrigin}/sanctum/csrf-cookie`, {
    headers: { Accept: "application/json", Origin: frontendOrigin },
  });
  expect(response.status()).toBe(204);
  const token = (await context.cookies()).find((cookie) => cookie.name === "XSRF-TOKEN");
  expect(token).toBeTruthy();
  return decodeURIComponent(token.value);
}

async function mutate(context, method, path, data) {
  const token = await csrf(context);
  return context.request.fetch(`${apiOrigin}${path}`, {
    method,
    data,
    headers: {
      Accept: "application/json",
      Origin: frontendOrigin,
      "X-XSRF-TOKEN": token,
    },
  });
}

async function login(context, email) {
  const response = await mutate(context, "POST", "/api/auth/login", { email, password });
  expect(response.status()).toBe(200);
  return (await response.json()).user;
}

test("real MySQL staging covers registration, shipment lifecycle, PIN, rating, realtime and logout", async ({ browser }) => {
  expect(password, "STAGING_TEST_PASSWORD must be supplied by the runner").toBeTruthy();
  const suffix = `${Date.now()}`.slice(-8);

  const senderContext = await browser.newContext({ ignoreHTTPSErrors: true });
  const courierContext = await browser.newContext({ ignoreHTTPSErrors: true });
  const recipientContext = await browser.newContext({ ignoreHTTPSErrors: true });

  try {
    const registration = await mutate(senderContext, "POST", "/api/auth/register", {
      name: "Fictitious Staging Sender",
      email: `staging.flow.${suffix}@example.test`,
      phone: `+2126${suffix}`,
      password,
      role: "expediteur",
      city: "Casablanca",
    });
    expect(registration.status()).toBe(201);
    const sender = (await registration.json()).user;

    const courier = await login(courierContext, "staging.courier@example.test");
    const recipient = await login(recipientContext, "staging.recipient@example.test");
    expect(sender.role).toBe("expediteur");
    expect(courier.role).toBe("livreur");
    expect(recipient.role).toBe("destinataire");

    const online = await mutate(courierContext, "PATCH", "/api/auth/me", { is_online: true });
    expect(online.status()).toBe(200);

    const senderPage = await senderContext.newPage();
    const courierPage = await courierContext.newPage();
    const realtimeDiagnostics = [];
    senderPage.on("console", (message) => {
      if (message.type() === "error") realtimeDiagnostics.push(`console: ${message.text()}`);
    });
    senderPage.on("pageerror", (error) => realtimeDiagnostics.push(`page: ${error.message}`));
    senderPage.on("requestfailed", (request) => {
      realtimeDiagnostics.push(`request: ${request.url()} (${request.failure()?.errorText || "failed"})`);
    });
    senderPage.on("websocket", (socket) => {
      realtimeDiagnostics.push(`websocket: ${new URL(socket.url()).origin}`);
      socket.on("framereceived", (event) => realtimeDiagnostics.push(`websocket-received: ${String(event.payload).slice(0, 200)}`));
      socket.on("framesent", (event) => realtimeDiagnostics.push(`websocket-sent: ${String(event.payload).slice(0, 200)}`));
      socket.on("socketerror", (error) => realtimeDiagnostics.push(`websocket-error: ${error}`));
      socket.on("close", () => realtimeDiagnostics.push("websocket-closed"));
    });
    const senderRealtimeReady = senderPage.waitForResponse(
      (response) => response.url().includes("/api/broadcasting/auth") && response.status() === 200,
      { timeout: 15_000 },
    );
    await Promise.all([
      senderPage.goto("/expediteur"),
      courierPage.goto("/livreur"),
    ]);
    await expect(senderPage.getByText("Fictitious Staging Sender")).toBeVisible();
    await expect(courierPage.getByText("Staging Courier")).toBeVisible();
    await senderRealtimeReady.catch((error) => {
      throw new Error(`Realtime subscription did not authenticate: ${realtimeDiagnostics.join(" | ") || error.message}`);
    });

    const quote = await mutate(senderContext, "POST", "/api/colis/quote", {
      from_city: "Casablanca", to_city: "Casablanca", weight: "2.500",
    });
    expect(quote.status()).toBe(200);
    const quoted = await quote.json();

    const clientRequestId = crypto.randomUUID();
    const createdResponse = await mutate(senderContext, "POST", "/api/colis", {
      client_request_id: clientRequestId,
      from_address: "100 Staging Street",
      to_address: "200 Validation Avenue",
      from_city: "Casablanca",
      to_city: "Casablanca",
      recipient_name: "Staging Recipient",
      recipient_phone: "+212600000102",
      weight: "2.500",
      description: "Fictitious integrated-test parcel",
      is_voyageur_eligible: false,
    });
    expect(createdResponse.status()).toBe(201);
    const shipment = await createdResponse.json();
    expect(shipment.price).toBe(quoted.amount);
    expect(shipment.pin_code).toMatch(/^\d{4}$/);
    expect(shipment.idempotent_replay).toBe(false);

    await senderPage.getByRole("button", { name: "Ouvrir les notifications" }).click();
    await expect(senderPage.getByText(new RegExp(shipment.tracking_id))).toBeVisible({ timeout: 10_000 });
    await senderPage.getByRole("heading", { name: /Bonjour/ }).click();
    await expect(senderPage.locator("#desktop-notifications")).toBeHidden();

    const claim = await mutate(courierContext, "PATCH", `/api/colis/${shipment.id}/status`, { status: "picked_up" });
    expect(claim.status()).toBe(200);

    const bypass = await mutate(courierContext, "PATCH", `/api/colis/${shipment.id}/status`, { status: "delivered" });
    expect(bypass.status()).toBe(422);

    for (const status of ["in_transit", "out_for_delivery"]) {
      const progression = await mutate(courierContext, "PATCH", `/api/colis/${shipment.id}/status`, { status });
      expect(progression.status()).toBe(200);
    }

    const delivered = await mutate(courierContext, "POST", `/api/colis/${shipment.id}/validate-pin`, { pin: shipment.pin_code });
    expect(delivered.status()).toBe(200);
    expect((await delivered.json()).colis.status).toBe("delivered");

    const recipientShipments = await recipientContext.request.get(`${apiOrigin}/api/colis`, {
      headers: { Accept: "application/json", Origin: frontendOrigin },
    });
    expect(recipientShipments.status()).toBe(200);
    expect((await recipientShipments.json()).data.some((item) => item.id === shipment.id)).toBe(true);

    const rating = await mutate(recipientContext, "POST", `/api/colis/${shipment.id}/rate`, {
      to_user_id: courier.id,
      score: 5,
      comment: "Fictitious staging validation",
    });
    expect(rating.status()).toBe(201);

    const notifications = await senderContext.request.get(`${apiOrigin}/api/auth/notifications`, {
      headers: { Accept: "application/json", Origin: frontendOrigin },
    });
    expect(notifications.status()).toBe(200);
    expect((await notifications.json()).data.some((item) => item.title.includes("livr"))).toBe(true);

    for (const context of [senderContext, courierContext, recipientContext]) {
      const logout = await mutate(context, "POST", "/api/auth/logout", {});
      expect(logout.status()).toBe(200);
      const me = await context.request.get(`${apiOrigin}/api/auth/me`, { headers: { Accept: "application/json", Origin: frontendOrigin } });
      expect(me.status()).toBe(401);
    }
  } finally {
    await Promise.all([senderContext.close(), courierContext.close(), recipientContext.close()]);
  }
});

test("administrator dashboard loads and requires a moderation reason", async ({ browser }) => {
  expect(password, "STAGING_TEST_PASSWORD must be supplied by the runner").toBeTruthy();
  const adminContext = await browser.newContext({ ignoreHTTPSErrors: true });

  try {
    const admin = await login(adminContext, "staging.admin@example.test");
    expect(admin.role).toBe("admin");

    const page = await adminContext.newPage();
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Tableau de Bord Administrateur" })).toBeVisible();
    await page.getByRole("button", { name: "Utilisateurs" }).click();
    await expect(page.getByText(/Tous les Utilisateurs/)).toBeVisible();

    await page.getByTitle("Avertir").first().click();
    const modal = page.locator("div.fixed").filter({ hasText: "Action sur" });
    const warnButton = modal.getByRole("button", { name: "Avertir" });
    await expect(warnButton).toBeDisabled();
    await modal.getByLabel("Raison / Motif").fill("Incident vérifié");
    await expect(warnButton).toBeEnabled();
    await modal.getByRole("button", { name: "Annuler" }).click();
    await expect(modal).toBeHidden();
  } finally {
    await adminContext.close();
  }
});
