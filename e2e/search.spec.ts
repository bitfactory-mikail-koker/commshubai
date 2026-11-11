import { expect, test } from "@playwright/test";
import { login, trackErrors } from "./helpers";

test("search finds content across kinds, filters by kind and links to the record", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "sanne@noordlicht.example");

  await page.getByRole("search").first().getByRole("searchbox").fill("klant");
  await page.getByRole("search").first().getByRole("searchbox").press("Enter");
  await expect(page).toHaveURL(/\/search\?q=klant/);
  await expect(page.getByRole("heading", { name: "Zoeken", level: 1 })).toBeVisible();
  await expect(page.locator("mark").first()).toBeVisible();

  const tabs = page.getByRole("navigation", { name: "Filters" });
  await expect(tabs.getByRole("link", { name: /Alles/ })).toBeVisible();
  await tabs.getByRole("link", { name: /Stukken/ }).click();
  await expect(page).toHaveURL(/soort=article/);

  await page.locator("main ul a").first().click();
  await expect(page).toHaveURL(/\/editorial\//);
  expect(errors).toEqual([]);
});

test("a partial word and an empty result are handled", async ({ page }) => {
  await login(page, "sanne@noordlicht.example");
  await page.goto("/search?q=lant");
  await expect(page.locator("mark").first()).toBeVisible();

  await page.goto("/search?q=zzzxqqnietsvanditbestaat");
  await expect(page.getByText("Niets gevonden")).toBeVisible();

  await page.goto("/search?q=%26%7C%21");
  await expect(page.getByText("Geen zoekwoorden herkend")).toBeVisible();
});

test("search needs a signed-in user", async ({ page }) => {
  await login(page, "sanne@noordlicht.example");
  await page.goto("/search?q=klant");
  await expect(page.locator("mark").first()).toBeVisible();
  await page.context().clearCookies();
  await page.goto("/search?q=klant");
  await expect(page).toHaveURL(/\/login/);
});
