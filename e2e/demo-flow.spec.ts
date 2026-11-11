import { expect, test, type Page } from "@playwright/test";
import { approveAsInterviewee, login, trackErrors } from "./helpers";

/**
 * The core product flow, end to end, through the real UI:
 *
 *   Slack message → signal detected & enriched → content opportunity →
 *   interview requested → interview held → draft written → review →
 *   human approval → permission confirmed → publication scheduled.
 *
 * It uses the guided demo scenario (simulated Slack message, demo AI provider
 * unless ANTHROPIC_API_KEY is set) and resets it afterwards.
 */

async function resetScenario(page: Page) {
  await page.goto("/demo");
  const reset = page.getByRole("button", { name: "Scenario resetten" });
  await page.waitForLoadState("networkidle");
  if ((await reset.count()) > 0) {
    await reset.click();
    await page.getByRole("button", { name: "Resetten", exact: true }).click();
    await expect(page.getByRole("button", { name: "Simuleer Slack-bericht" })).toBeEnabled({ timeout: 30_000 });
  }
}

test("from Slack message to scheduled publication", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const errors = trackErrors(page);
  await login(page, "sanne@noordlicht.example");
  await resetScenario(page);

  // 1-3. A Slack message arrives; the engine detects a signal and the external agent proposes a story.
  await page.getByRole("button", { name: "Simuleer Slack-bericht" }).click();
  await expect(page.getByText(/signaal gedetecteerd/i).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Klantcase: Veldhuis Zorggroep - Cliëntenportaal Mijn Veldhuis").first()).toBeVisible({ timeout: 30_000 });

  // The signal is in the inbox with related sources from Jira and Teamleader.
  await page.goto("/inbox");
  await page.getByRole("link", { name: /Veldhuis Zorggroep/ }).first().click();
  await page.waitForURL(/\/inbox\/[0-9a-f-]+$/);
  await expect(page.getByText("VZG-142").first()).toBeVisible();
  await expect(page.getByText(/vervolgopdracht fase 2/).first()).toBeVisible();
  await expect(page.getByText("Toestemming van de klant voor externe publicatie").first()).toBeVisible();

  // 4. The external agent picks up the opportunity and requests an interview.
  await page.goto("/demo");
  await page.getByRole("button", { name: "Kans oppakken en interview aanvragen" }).click();
  const interviewLink = page.locator('main a[href^="/interviews/"]').first();
  await expect(interviewLink).toBeVisible({ timeout: 60_000 });

  // 5. The interview is held in the Interview Studio.
  await interviewLink.click();
  await page.waitForURL(/\/interviews\/[0-9a-f-]+$/);
  await page.getByRole("button", { name: "Interview starten" }).first().click();
  await expect(page.getByText(/Wat was de aanleiding/).first()).toBeVisible({ timeout: 60_000 });

  // Answer the first question by hand, the rest with the scripted demo answers.
  await page.getByRole("button", { name: "Demo-antwoord invullen" }).click();
  await page.getByRole("button", { name: "Versturen" }).click();
  await expect(page.getByText(/Hoe hebben jullie het aangepakt/).first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Alles beantwoorden met demo-antwoorden" }).first().click();
  await expect(page.getByText("Afgerond", { exact: true }).first()).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/1\.240 cliënten/).first()).toBeVisible();

  // 6. The external agent writes the draft.
  await page.goto("/demo");
  await page.getByRole("button", { name: "Laat de externe agent het concept schrijven" }).click();
  const editorLink = page.getByRole("link", { name: "Naar de redactie" });
  await expect(editorLink).toBeVisible({ timeout: 90_000 });
  await editorLink.click();
  await page.waitForURL(/\/editorial\/[0-9a-f-]+$/);
  const articleUrl = page.url();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Veldhuis Zorggroep");
  // The draft quotes the interview verbatim.
  await expect(page.getByText(/In de eerste week van de pilot logden 1\.240 cliënten in/).first()).toBeVisible();

  // 7. Review and human approval: first the interviewee approves his own quotes, then the editors.
  await page.getByRole("button", { name: "Indienen ter review" }).click();
  await expect(page.getByText("In review").first()).toBeVisible({ timeout: 30_000 });
  expect(await approveAsInterviewee(browser, "Veldhuis Zorggroep")).toBeGreaterThan(0);
  await page.goto(articleUrl);
  // The demo project has no DM or Strateeg linked, so the next step is the editors'.
  const approve = page.getByRole("button", { name: "Goedkeuren", exact: true });
  await expect(approve).toBeVisible({ timeout: 30_000 });
  await approve.click();
  await page.getByRole("dialog").getByRole("button", { name: "Goedkeuren", exact: true }).click();
  await expect(page.getByText(/Item goedgekeurd/).first()).toBeVisible({ timeout: 30_000 });

  // Scheduling is blocked until a human confirms permission for external publication.
  const schedule = page.getByRole("button", { name: "Publicatie inplannen" });
  await expect(schedule).toBeDisabled();
  await page.getByRole("combobox", { name: "Status van de toestemming" }).click();
  await page.getByRole("option", { name: "Toestemming verleend" }).click();
  await page.getByLabel("Toelichting bij de toestemming").fill("Akkoord per e-mail van Anouk Peters.");
  await page.getByRole("button", { name: "Toestemming vastleggen" }).click();
  await expect(schedule).toBeEnabled({ timeout: 30_000 });

  // 8. Schedule the publication.
  await schedule.click();
  const future = new Date(Date.now() + 3 * 86400_000);
  const value = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}T09:00`;
  await page.getByLabel("Datum en tijd").fill(value);
  await page.getByRole("dialog").getByRole("button", { name: "Inplannen", exact: true }).click();
  await expect(page.getByText("Ingepland").first()).toBeVisible({ timeout: 30_000 });

  // The publication is on the calendar, the scenario is complete and the activity log has the trail.
  await page.goto("/calendar?view=list");
  await expect(page.getByText(/Veldhuis Zorggroep/).first()).toBeVisible();
  await page.goto("/agents");
  await expect(page.getByText(/Concept geschreven voor “Klantcase: Veldhuis Zorggroep/).first()).toBeVisible();

  // Approved content is locked.
  await page.goto(articleUrl);
  await expect(page.getByText(/vergrendeld|Alleen-lezen/i).first()).toBeVisible();

  expect(errors, errors.join("\n")).toEqual([]);
  await resetScenario(page);
});
