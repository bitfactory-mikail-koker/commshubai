import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import { approveAsInterviewee, login, trackErrors } from "./helpers";

/**
 * Workflows around the core flow. These tests change demo data;
 * run `npm run db:seed` afterwards to restore the starting state.
 */

test("an employee sends a tip and gets the bot's answer", async ({ page }) => {
  await login(page, "tim@noordlicht.example");
  await page.goto("/inbox");
  await page.getByRole("button", { name: "Tip doorgeven" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Onderwerp").fill("Support haalt klanttevredenheid van 9,1");
  await dialog
    .getByLabel("Wat speelt er?")
    .fill("Het supportteam heeft dit kwartaal een klanttevredenheid van 9,1 behaald, een record. Trots op het hele team dat dit heeft gehaald!");
  await dialog.getByRole("button", { name: "Versturen" }).click();
  // The bot sorts the tip and answers: here, a new proposal for the editors.
  await expect(page.getByRole("dialog").getByText(/redactie/).first()).toBeVisible({ timeout: 60_000 });
});

test("validation errors are shown in the form", async ({ page }) => {
  await login(page, "tim@noordlicht.example");
  await page.goto("/inbox");
  await page.getByRole("button", { name: "Tip doorgeven" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Wat speelt er?").fill("Te kort.");
  await dialog.getByRole("button", { name: "Versturen" }).click();
  await expect(page.getByText(/minimaal 20 tekens/).first()).toBeVisible();
});

test("editing creates a version; brand settings drive the brand check", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "sanne@noordlicht.example");

  // Add a word to avoid in Brand & Tone of Voice.
  await page.goto("/brand");
  await page.locator("#wordDraft").fill("mijlpaal");
  await page.locator("#wordDraft").press("Enter");
  await page.getByRole("button", { name: "Opslaan", exact: true }).click();
  await expect(page.getByText("Merkrichtlijnen opgeslagen.")).toBeVisible();

  // Edit the draft: the text now contains the word.
  await page.goto("/editorial?view=list");
  await page.getByRole("link", { name: /Nul openstaande bugs op productie/ }).first().click();
  await page.waitForURL(/\/editorial\/[0-9a-f-]+$/);
  const editor = page.locator(".tiptap");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" Dit is een mooie mijlpaal voor het team.");
  await page.getByRole("button", { name: /Opslaan als versie 2/ }).click();
  await expect(page.getByText("Versie 2 opgeslagen.")).toBeVisible();

  // The brand check picks up the new rule and the open placeholder.
  await page.getByRole("button", { name: "Opnieuw controleren" }).click();
  await expect(page.getByText(/Merkcontrole uitgevoerd/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/“mijlpaal” staat op de lijst met te vermijden woorden/).first()).toBeVisible();

  // Comments.
  await page.getByRole("tab", { name: /Opmerkingen/ }).click();
  await page.getByRole("textbox", { name: "Opmerking" }).fill("Graag nog een quote van Ruben toevoegen.");
  await page.getByRole("button", { name: "Opmerking plaatsen" }).click();
  await expect(page.getByText("Graag nog een quote van Ruben toevoegen.").first()).toBeVisible();

  // Version history shows both versions.
  await page.getByRole("tab", { name: /Versies/ }).click();
  await expect(page.getByText("Handmatig bewerkt").first()).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("newsletter: submit, approve and send (simulated)", async ({ page }) => {
  await login(page, "sanne@noordlicht.example");
  await page.goto("/newsletters");
  await page.getByRole("link", { name: /Interne nieuwsbrief/ }).first().click();
  await page.waitForURL(/\/newsletters\/[0-9a-f-]+$/);
  await page.getByRole("button", { name: "Indienen ter goedkeuring" }).click();
  await expect(page.getByText("Nieuwsbrief ingediend ter goedkeuring.")).toBeVisible();
  await page.getByRole("button", { name: "Goedkeuren", exact: true }).click();
  await expect(page.getByText("Nieuwsbrief goedgekeurd.")).toBeVisible();
  await page.getByRole("button", { name: "Verzenden (gesimuleerd)" }).click();
  await page.getByRole("button", { name: "Markeren als verzonden" }).click();
  await expect(page.getByText(/Gemarkeerd als verzonden \(gesimuleerd/)).toBeVisible();
  await expect(page.getByText("Verzonden", { exact: true }).first()).toBeVisible();
});

test("integrations: demo simulation delivers marked sample data; OAuth-only integrations offer no connection test", async ({ page }) => {
  await login(page, "sanne@noordlicht.example");
  await page.goto("/integrations/teamleader");
  await page.getByRole("button", { name: "Demo-synchronisatie uitvoeren" }).click();
  await expect(page.getByText(/Demo-synchronisatie: \d gesimuleerd/).first()).toBeVisible({ timeout: 60_000 });

  await page.goto("/integrations/linkedin");
  await expect(page.getByText(/OAuth/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Verbinding testen" })).toHaveCount(0);
});

test("CMS webhook: real connection test and signed publication", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const secret = "e2e-signing-secret-0123456789";
  const received: { event: string; signature: string; body: string }[] = [];
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push({ event: String(req.headers["x-commshub-event"]), signature: String(req.headers["x-commshub-signature"]), body });
      res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    await login(page, "sanne@noordlicht.example");
    await page.goto("/integrations/cms");
    await page.locator("#config-webhook_url").fill(`http://127.0.0.1:${port}/hook`);
    await page.locator("#secret-signing_secret").fill(secret);
    await page.getByRole("button", { name: "Instellingen opslaan" }).click();
    await expect(page.getByText(/Instellingen opgeslagen/).first()).toBeVisible();
    await page.getByRole("button", { name: "Verbinding testen" }).click();
    await expect(page.getByText(/Verbinding geslaagd/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Verbonden", { exact: true }).first()).toBeVisible();

    expect(received.at(-1)?.event).toBe("ping");
    const ping = received.at(-1)!;
    expect(ping.signature).toBe(`sha256=${createHmac("sha256", secret).update(ping.body).digest("hex")}`);

    // The interviewee approves his own quote first (and, as DM of the project, the piece); then the editors.
    await approveAsInterviewee(browser, "Brouwerij De Koperen Ketel");

    // Approve an external article, confirm permission and publish: it goes to the webhook.
    await page.goto("/editorial?view=list");
    await page.getByRole("link", { name: /Brouwerij De Koperen Ketel/ }).first().click();
    await page.waitForURL(/\/editorial\/[0-9a-f-]+$/);
    // The customer case rule: the person quoted, then the DM of the project (also Tim). Then it is ready.
    await expect(page.getByText("Goedgekeurd").first()).toBeVisible();
    await page.getByRole("combobox", { name: "Status van de toestemming" }).click();
    await page.getByRole("option", { name: "Toestemming verleend" }).click();
    await page.getByRole("button", { name: "Toestemming vastleggen" }).click();
    await expect(page.getByText("Toestemming voor externe publicatie bijgewerkt.")).toBeVisible();
    await page.getByRole("button", { name: /Nu publiceren/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Publiceren", exact: true }).click();
    await expect(page.getByText("Gepubliceerd via het CMS.")).toBeVisible({ timeout: 30_000 });

    const published = received.find((r) => r.event === "article.published");
    expect(published, "webhook received the article").toBeTruthy();
    const payload = JSON.parse(published!.body);
    expect(payload.article.title).toContain("Brouwerij De Koperen Ketel");
    expect(payload.article.body_html).toContain("410 bestellingen");
    expect(published!.signature).toBe(`sha256=${createHmac("sha256", secret).update(published!.body).digest("hex")}`);

    // Clean up: disconnect so later publications are simulated again.
    await page.goto("/integrations/cms");
    await page.getByRole("button", { name: "Ontkoppelen" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Ontkoppelen", exact: true }).click();
    await expect(page.getByText(/Integratie ontkoppeld/).first()).toBeVisible();
  } finally {
    server.close();
  }
});

test("team: an administrator adds a user who can then sign in", async ({ page, browser }) => {
  const email = `e2e-${Date.now()}@noordlicht.example`;
  await login(page, "sanne@noordlicht.example");
  await page.goto("/team");
  await page.getByRole("button", { name: "Gebruiker toevoegen" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Naam").fill("Eva Test");
  await dialog.getByLabel("E-mailadres").fill(email);
  await dialog.getByRole("combobox").first().click();
  await page.getByRole("option", { name: /Redacteur/ }).first().click();
  await dialog.getByRole("button", { name: "Gebruiker toevoegen" }).click();
  await expect(dialog.getByText("Tijdelijk wachtwoord")).toBeVisible({ timeout: 30_000 });
  const password = (await dialog.locator("code").innerText()).trim();
  expect(password.length).toBeGreaterThanOrEqual(10);

  const context = await browser.newContext();
  const fresh = await context.newPage();
  await fresh.goto("/login");
  await fresh.getByLabel("E-mailadres").fill(email);
  await fresh.getByLabel("Wachtwoord").fill(password);
  await fresh.getByRole("button", { name: "Inloggen", exact: true }).click();
  await fresh.waitForURL("**/dashboard");
  await expect(fresh.getByText(/Goede(morgen|middag|navond), Eva/)).toBeVisible();
  await context.close();
});

test("agents: a paused agent does no work until it is reactivated", async ({ page }) => {
  await login(page, "sanne@noordlicht.example");
  await page.goto("/agents");
  // Both agent cards have a pause button; pick the one for the external agent.
  const pauseButtons = page.getByRole("button", { name: "Pauzeren" });
  // The page streams in after the loading skeleton; wait for both agent cards.
  await expect(pauseButtons).toHaveCount(2);
  const total = await pauseButtons.count();
  for (let i = 0; i < total; i++) {
    // After a dialog closes the page content becomes reachable again.
    await expect(pauseButtons).toHaveCount(total);
    await pauseButtons.nth(i).click();
    const confirm = page.getByRole("alertdialog");
    const title = await confirm.getByRole("heading").innerText();
    if (title.includes("Externe")) {
      await confirm.getByRole("button", { name: "Pauzeren", exact: true }).click();
      break;
    }
    await confirm.getByRole("button", { name: "Annuleren" }).click();
    await expect(confirm).toBeHidden();
  }
  await expect(page.getByText("Agent gepauzeerd.")).toBeVisible();

  // The paused agent refuses to evaluate a signal.
  await page.goto("/inbox");
  await page.getByRole("link", { name: /Verhuizing naar de Oudegracht/ }).first().click();
  await page.waitForURL(/\/inbox\/[0-9a-f-]+$/);
  await page.getByRole("button", { name: /externe agent/i }).first().click();
  await expect(page.getByText(/is gepauzeerd/).first()).toBeVisible({ timeout: 30_000 });

  await page.goto("/agents");
  await page.getByRole("button", { name: "Activeren" }).first().click();
  await expect(page.getByText("Agent geactiveerd.")).toBeVisible();
});
