import { expect, type Browser, type Page } from "@playwright/test";

export const PASSWORD = "Demo-Noordlicht-2026";

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByLabel("Wachtwoord").fill(PASSWORD);
  await page.getByRole("button", { name: "Inloggen", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/** Collects console errors and failed requests so tests can assert a clean page. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 500) errors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  return errors;
}

/**
 * Signs in as the interviewee in a separate browser context and gives every
 * approval that waits for them on the item with this title (own quotes first,
 * then any later step that is theirs). Returns how many rounds were approved.
 */
export async function approveAsInterviewee(browser: Browser, title: string, email = "tim@noordlicht.example"): Promise<number> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, email);
  let rounds = 0;
  for (let i = 0; i < 4; i++) {
    await page.goto("/for-me");
    await expect(page.getByRole("heading", { name: "Wacht op jouw akkoord" })).toBeVisible();
    const waiting = page.locator("section", { has: page.getByRole("heading", { name: "Wacht op jouw akkoord" }) });
    const link = waiting.getByRole("link", { name: new RegExp(title) }).first();
    if ((await link.count()) === 0) break;
    await link.click();
    await page.waitForURL(/\/preview\//);
    await page.getByRole("button", { name: /^Akkoord( met alles)?$/ }).last().click();
    await expect(page.getByText(/Akkoord vastgelegd/).first()).toBeVisible({ timeout: 30_000 });
    rounds++;
  }
  await context.close();
  return rounds;
}
