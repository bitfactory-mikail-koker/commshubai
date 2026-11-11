import { expect, test, type Page } from "@playwright/test";
import { login, trackErrors } from "./helpers";

const openModal = async (page: Page) => {
  await page.getByRole("button", { name: "Zoeken openen" }).click();
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
  await expect(dialog.getByRole("tab", { name: /Alles/ })).toHaveAttribute("aria-selected", "true");

  await dialog.getByRole("tab", { name: /Stukken/ }).click();
  await expect(dialog.getByRole("tab", { name: /Stukken/ })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("listbox")).toHaveAttribute("aria-busy", "false");
  await expect(dialog.getByRole("option").first()).toBeVisible();

  await input.press("ArrowDown");
  await expect(dialog.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
  await input.press("ArrowUp");
  await input.press("Enter");

  await expect(page).toHaveURL(/\/editorial\//);
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});

test("keyboard shortcuts open and close the modal, Ctrl+Enter shows all results", async ({ page }) => {
  await login(page, "sanne@noordlicht.example");

  await page.keyboard.press("/");
  const dialog = page.getByRole("dialog", { name: "Zoeken" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.keyboard.press("Control+k");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").fill("klant");
  await expect(dialog.getByRole("option").first()).toBeVisible();
  await dialog.getByRole("combobox").press("Control+Enter");
  await expect(page).toHaveURL(/\/search\?q=klant/);
  await expect(page.getByRole("heading", { name: "Zoeken", level: 1 })).toBeVisible();
});

test("the modal handles partial words, no results and remembers recent searches", async ({ page }) => {
  await login(page, "sanne@noordlicht.example");

  let dialog = await openModal(page);
  await dialog.getByRole("combobox").fill("lant");
  await expect(dialog.locator("mark").first()).toBeVisible();

  await dialog.getByRole("combobox").fill("zzzxqqnietsvanditbestaat");
  await expect(dialog.getByText(/Niets gevonden/)).toBeVisible();

  await dialog.getByRole("combobox").fill("klant");
  await expect(dialog.getByRole("option").first()).toBeVisible();
  await dialog.getByRole("button", { name: "Alle resultaten bekijken" }).click();
  await expect(page).toHaveURL(/\/search\?q=klant/);

  dialog = await openModal(page);
  await expect(dialog.getByText("Recent gezocht")).toBeVisible();
  await dialog.getByRole("button", { name: "klant", exact: true }).click();
  await expect(dialog.getByRole("combobox")).toHaveValue("klant");
});

test("the search page still works on its own", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "sanne@noordlicht.example");
  await page.goto("/search?q=klant");
  await expect(page.locator("mark").first()).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Filters" });
  await tabs.getByRole("link", { name: /Stukken/ }).click();
  await expect(page).toHaveURL(/soort=article/);
  await page.locator("main ul a").first().click();
  await expect(page).toHaveURL(/\/editorial\//);

  await page.goto("/search?q=zzzxqqnietsvanditbestaat");
  await expect(page.getByText("Niets gevonden")).toBeVisible();
  await page.goto("/search?q=%26%7C%21");
  await expect(page.getByText("Geen zoekwoorden herkend")).toBeVisible();
  expect(errors).toEqual([]);
});

test("search needs a signed-in user", async ({ page }) => {
  await login(page, "sanne@noordlicht.example");
  await page.context().clearCookies();
  await page.goto("/search?q=klant");
  await expect(page).toHaveURL(/\/login/);
  const response = await page.request.get("/api/search?q=klant", { maxRedirects: 0 });
  expect([307, 308, 401]).toContain(response.status());
});
