import path from "node:path";
import { expect, test } from "@playwright/test";

const apiOrigin = process.env.STAGING_API_URL || "https://api.logistics.local";
const frontendOrigin = process.env.STAGING_FRONTEND_URL || "https://logistics.local";
const password = process.env.STAGING_TEST_PASSWORD;
const outputDir = path.resolve(process.cwd(), "../docs/screenshots");

async function csrf(context) {
  const response = await context.request.get(`${apiOrigin}/sanctum/csrf-cookie`, {
    headers: { Accept: "application/json", Origin: frontendOrigin },
  });
  expect(response.status()).toBe(204);
  const token = (await context.cookies()).find((cookie) => cookie.name === "XSRF-TOKEN");
  expect(token).toBeTruthy();
  return decodeURIComponent(token.value);
}

async function login(context, email) {
  const token = await csrf(context);
  const response = await context.request.post(`${apiOrigin}/api/auth/login`, {
    data: { email, password },
    headers: {
      Accept: "application/json",
      Origin: frontendOrigin,
      "X-XSRF-TOKEN": token,
    },
  });
  expect(response.status()).toBe(200);
}

async function preparePage(page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content: "*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }",
  });
}

test("capture portfolio screens from the validated staging application", async ({ browser }) => {
  expect(password, "STAGING_TEST_PASSWORD must be supplied by the runner").toBeTruthy();

  const publicPage = await browser.newPage();
  await publicPage.goto(frontendOrigin, { waitUntil: "networkidle" });
  await expect(publicPage.getByRole("heading", { name: /Gérez vos livraisons/i })).toBeVisible();
  await preparePage(publicPage);
  await publicPage.screenshot({ path: path.join(outputDir, "landing-page.png"), fullPage: true });
  await publicPage.close();

  for (const account of [
    {
      email: "staging.sender@example.test",
      route: "/expediteur",
      title: /Tableau de bord Expéditeur/i,
      filename: "sender-dashboard.png",
    },
    {
      email: "staging.courier@example.test",
      route: "/livreur",
      title: /Affichage des colis disponibles/i,
      filename: "courier-dashboard.png",
    },
  ]) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } });
    await login(context, account.email);
    const page = await context.newPage();
    await page.goto(`${frontendOrigin}${account.route}`, { waitUntil: "networkidle" });
    await expect(page.getByText(account.title)).toBeVisible();
    await preparePage(page);
    await page.screenshot({ path: path.join(outputDir, account.filename), fullPage: true });
    await context.close();
  }
});
