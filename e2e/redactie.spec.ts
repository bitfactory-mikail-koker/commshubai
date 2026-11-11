import { expect, test } from "@playwright/test";
import { login, trackErrors } from "./helpers";

/**
 * The approver's side of the redactie. Changes demo data; run `npm run db:seed` afterwards.
 */

test("an interviewee asks for a change in plain words and sees only what changed", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "tim@noordlicht.example");
  await page.goto("/for-me");
  const waiting = page.locator("section", { has: page.getByRole("heading", { name: "Wacht op jouw akkoord" }) });
  await waiting.getByRole("link", { name: /Brouwerij De Koperen Ketel/ }).click();
  await page.waitForURL(/\/preview\/article\//);

  // His own quote is marked, and only he can approve it.
  await expect(page.locator("mark.quote-mark").first()).toBeVisible();
  await expect(page.getByText("Alleen jij kunt ze goedkeuren", { exact: false })).toBeVisible();

  // "Aanpassing vragen": the bot carries out a literal request and starts a new round.
  await page.getByRole("button", { name: "Aanpassing vragen" }).click();
  await page.getByLabel("Wat moet er anders?").fill('Vervang "webshop" door "online winkel"');
  await page.getByRole("dialog").getByRole("button", { name: "Versturen" }).click();
  await expect(page.getByText(/De tekst is aangepast/).first()).toBeVisible({ timeout: 30_000 });

  // Back on the preview: he sees the changes since the version he looked at.
  await page.reload();
  await expect(page.getByRole("link", { name: /Wijzigingen sinds versie 1/ })).toBeVisible();
  await expect(page.locator("ins.diff-added", { hasText: "online" }).first()).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("the editors cannot approve a quote on someone else's behalf", async ({ page }) => {
  await login(page, "daan@noordlicht.example");
  await page.goto("/editorial?view=list");
  await page.getByRole("link", { name: /Kwartaalupdate Q3/ }).first().click();
  await page.waitForURL(/\/editorial\/[0-9a-f-]+$/);
  // The round shows who it waits for; there is no approve button for the chief editor.
  await expect(page.getByRole("heading", { name: "Goedkeuringsronde" })).toBeVisible();
  await expect(page.getByText("Marieke van Dijk").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Goedkeuren", exact: true })).toHaveCount(0);
});

test("the pause button stops the bot and can be undone", async ({ page }) => {
  await login(page, "sanne@noordlicht.example");
  await page.goto("/bot");
  await page.getByRole("button", { name: /Bot pauzeren/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: /Pauzeren/ }).click();
  await expect(page.getByText("Bot: gepauzeerd").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Bot hervatten/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: /Hervatten/ }).click();
  await expect(page.getByText("Bot: schaduwmodus").first()).toBeVisible({ timeout: 30_000 });
});
