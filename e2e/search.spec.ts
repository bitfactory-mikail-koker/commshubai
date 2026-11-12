import { expect, test, type Page } from "@playwright/test";
import { login, trackErrors } from "./helpers";

const openModal = async (page: Page) => {
  await page.getByRole("button", { name: "Zoeken openen" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Zoeken" });
  await expect(dialog).toBeVisible();
  return dialog;
};

test("the search modal finds content, filters by kind and opens the record", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "sanne@noordlicht.example");

  const dialog = await openModal(page);
  const input = dialog.getByRole("combobox");
  await expect(input).toBeFocused();
  await input.fill("klant");

  await expect(dialog.getByRole("option").first()).toBeVisible();
  await expect(dialog.locator("mark").first()).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Alles, \d+ resultaten$/ })).toHaveAttribute("aria-pressed", "true");

  await dialog.getByRole("button", { name: /^Stukken, \d+ resultaten?$/ }).click();
  await expect(dialog.getByRole("button", { name: /^Stukken/ })).toHaveAttribute("aria-pressed", "true");
  await expect(input).toBeFocused();
  await expect(dialog.getByRole("listbox")).toHaveAttribute("aria-busy", "false");

  const groups = dialog.getByRole("group").filter({ has: page.getByRole("option") });
  await expect(groups).toHaveCount(1);
  await expect(dialog.getByRole("option").first()).toBeVisible();

  await input.press("ArrowDown");
  await expect(dialog.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
  await input.press("ArrowUp");
  await input.press("Enter");

  await expect(page).toHaveURL(/\/editorial\//);
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});

test("Ctrl+K opens and Escape closes the modal, and focus returns to where it was", async ({ page }) => {
  await login(page, "sanne@noordlicht.example");

  const trigger = page.getByRole("button", { name: "Zoeken openen" }).first();
  await trigger.focus();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Zoeken" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await page.keyboard.press("/");
  await expect(dialog).toBeHidden();

  await page.keyboard.press("Control+k");
  await dialog.getByRole("combobox").fill("klant");
  await expect(dialog.getByRole("option").first()).toBeVisible();
  await dialog.getByRole("combobox").press("Control+Enter");
  await expect(page).toHaveURL(/\/search\?q=klant/);
  await expect(page.getByRole("heading", { name: "Zoeken", level: 1 })).toBeVisible();
});

test("results and states are announced to screen readers", async ({ page }) => {
  await login(page, "sanne@noordlicht.example");
  const dialog = await openModal(page);
  const status = dialog.getByRole("status");

  await dialog.getByRole("combobox").fill("klant");
  await expect(status).toHaveText(/^\d+ resultaten$/);
  await expect(dialog.getByRole("combobox")).toHaveAccessibleName("Zoeken");

  await dialog.getByRole("combobox").fill("zzzxqqnietsvanditbestaat");
  await expect(status).toHaveText(/Niets gevonden voor/);
  await expect(dialog.getByRole("combobox")).not.toHaveAttribute("aria-controls");
});

test("the modal handles partial words, no results and remembers recent searches per user", async ({ page }) => {
  await login(page, "sanne@noordlicht.example");

  let dialog = await openModal(page);
  await dialog.getByRole("combobox").fill("lant");
  await expect(dialog.locator("mark").first()).toBeVisible();

  await dialog.getByRole("combobox").fill("zzzxqqnietsvanditbestaat");
  await expect(dialog.getByText(/Niets gevonden/).first()).toBeVisible();

  await dialog.getByRole("combobox").fill("klant");
  await expect(dialog.getByRole("option").first()).toBeVisible();
  await dialog.getByRole("button", { name: "Alle resultaten bekijken" }).click();
  await expect(page).toHaveURL(/\/search\?q=klant/);

  dialog = await openModal(page);
  await expect(dialog.getByText("Recent gezocht")).toBeVisible();
  await dialog.getByRole("button", { name: "klant", exact: true }).click();
  await expect(dialog.getByRole("combobox")).toHaveValue("klant");
  await expect(dialog.getByRole("combobox")).toBeFocused();
});

test("a single letter asks for more instead of matching everything", async ({ page }) => {
  await login(page, "sanne@noordlicht.example");
  const dialog = await openModal(page);
  await dialog.getByRole("combobox").fill("a");
  await expect(dialog.getByText("Typ minstens twee tekens om te zoeken.").first()).toBeVisible();
  await expect(dialog.getByRole("option")).toHaveCount(0);
  await expect(dialog.locator("mark")).toHaveCount(0);
});

test("the search page filters without empty groups and survives odd parameters", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "sanne@noordlicht.example");
  await page.goto("/search?q=klant");
  await expect(page.locator("mark").first()).toBeVisible();

  const tabs = page.getByRole("navigation", { name: "Filter op soort" });
  await tabs.getByRole("link", { name: /Stukken/ }).click();
  await expect(page).toHaveURL(/soort=article/);
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(1);
  await page.locator("main ul a").first().click();
  await expect(page).toHaveURL(/\/editorial\//);

  await page.goto("/search?q=klant&q=ander");
  await expect(page.getByRole("heading", { name: "Zoeken", level: 1 })).toBeVisible();

  await page.goto("/search?q=klant&soort=article&pagina=999");
  await expect(page).toHaveURL(/soort=article/);
  await expect(page.getByText(/Pagina \d+ van \d+/).or(page.locator("main ul a").first()).first()).toBeVisible();

  await page.goto("/search?q=zzzxqqnietsvanditbestaat");
  await expect(page.getByText("Niets gevonden")).toBeVisible();
  await page.goto("/search?q=%26%7C%21");
  await expect(page.getByText("Geen zoekwoorden herkend")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the page title follows the search", async ({ page }) => {
  await login(page, "sanne@noordlicht.example");
  await page.goto("/search?q=klant&soort=article");
  await expect(page).toHaveTitle(/Zoeken: klant, Stukken/);
});

test("search needs a signed-in user", async ({ page }) => {
  await login(page, "sanne@noordlicht.example");
  await page.context().clearCookies();
  await page.goto("/search?q=klant");
  await expect(page).toHaveURL(/\/login/);
  const response = await page.request.get("/api/search?q=klant", { maxRedirects: 0 });
  expect([307, 308, 401]).toContain(response.status());
});

test("the modal is reachable on a phone and can be closed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "sanne@noordlicht.example");
  const dialog = await openModal(page);
  await expect(dialog.getByRole("button", { name: "Sluiten" })).toBeVisible();
  await dialog.getByRole("button", { name: "Sluiten" }).click();
  await expect(dialog).toBeHidden();
});

test("an employee cannot find comments on pieces they cannot see", async ({ page }) => {
  await login(page, "tim@noordlicht.example");
  const response = await page.request.get("/api/search?q=bron");
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { groups: { kind: string; hits: { href: string | null }[] }[] };
  const comments = body.groups.find((group) => group.kind === "comment");
  for (const hit of comments?.hits ?? []) {
    const visit = hit.href ? await page.request.get(hit.href) : null;
    if (visit) expect(visit.status()).toBeLessThan(400);
  }
});
