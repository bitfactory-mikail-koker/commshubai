import { expect, test } from "@playwright/test";
import { login, trackErrors } from "./helpers";

const ROUTES: { path: string; heading: RegExp }[] = [
  { path: "/dashboard", heading: /Dashboard/ },
  { path: "/for-me", heading: /Voor mij/ },
  { path: "/inbox", heading: /Inbox/ },
  { path: "/topics", heading: /Onderwerpen/ },
  { path: "/projects", heading: /Projecten/ },
  { path: "/editorial", heading: /Redacti/ },
  { path: "/external", heading: /Extern/ },
  { path: "/internal", heading: /Intern/ },
  { path: "/interviews", heading: /Interview/ },
  { path: "/newsletters", heading: /Edities/ },
  { path: "/calendar", heading: /kalender/i },
  { path: "/agents", heading: /agents/i },
  { path: "/brand", heading: /Merk/ },
  { path: "/integrations", heading: /Integraties/ },
  { path: "/integrations/slack", heading: /Slack/ },
  { path: "/team", heading: /Mensen en rollen/ },
  { path: "/groups", heading: /Groepen/ },
  { path: "/rules", heading: /Goedkeuringsregels/ },
  { path: "/for-me/data", heading: /bewaard/ },
  { path: "/bot", heading: /Gedrag en postvak/ },
  { path: "/bot?weergave=uitproberen", heading: /Gedrag en postvak/ },
  { path: "/bot?weergave=instellingen", heading: /Gedrag en postvak/ },
  { path: "/channels", heading: /Kanalen/ },
  { path: "/logbook", heading: /Logboek/ },
  { path: "/figures", heading: /Cijfers/ },
  { path: "/settings", heading: /Instellingen/ },
  { path: "/demo", heading: /Slack-bericht/ },
];

test.describe("smoke: every section renders for an administrator", () => {
  test("all navigation sections load without errors", async ({ page }) => {
    const errors = trackErrors(page);
    await login(page, "sanne@noordlicht.example");
    for (const route of ROUTES) {
      const response = await page.goto(route.path);
      expect(response?.status(), route.path).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1 }), route.path).toContainText(route.heading);
    }
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("detail pages load", async ({ page }) => {
    const errors = trackErrors(page);
    await login(page, "sanne@noordlicht.example");

    await page.goto("/inbox");
    await page.getByRole("link", { name: /Stichting Lezen Verbindt/ }).first().click();
    await page.waitForURL(/\/inbox\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Stichting Lezen Verbindt");

    await page.goto("/editorial?view=list");
    await page.getByRole("link", { name: /Rijnmond Logistiek/ }).first().click();
    await page.waitForURL(/\/editorial\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Rijnmond Logistiek");

    await page.goto("/interviews");
    await page.getByRole("link", { name: /Rijnmond Logistiek/ }).first().click();
    await page.waitForURL(/\/interviews\/[0-9a-f-]+$/);
    await expect(page.getByText("In de eerste week na de uitrol kwamen er 32% minder telefoontjes").first()).toBeVisible();

    await page.goto("/newsletters");
    await page.getByRole("link", { name: /Interne nieuwsbrief/ }).first().click();
    await page.waitForURL(/\/newsletters\/[0-9a-f-]+$/);
    await expect(page.getByText("We verhuizen naar de Oudegracht").first()).toBeVisible();

    expect(errors, errors.join("\n")).toEqual([]);
  });
});

test.describe("role-based access in the interface", () => {
  test("an employee sees a limited interface", async ({ page }) => {
    await login(page, "tim@noordlicht.example");
    const nav = page.getByRole("navigation", { name: "Hoofdnavigatie" }).first();
    await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Extern bureau" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "AI-agents" })).toHaveCount(0);

    // Pages that need editorial rights redirect back to the dashboard.
    await page.goto("/external");
    await page.waitForURL(/\/dashboard/);
    await expect(page.getByText("Geen toegang", { exact: true })).toBeVisible();

    // The inbox only shows the employee's own submission.
    await page.goto("/inbox");
    await expect(page.getByText("Joost spreekt op de Frontend Dag").first()).toBeVisible();
    await expect(page.getByText("Brouwerij De Koperen Ketel")).toHaveCount(0);
  });

  test("signed-out visitors are sent to the login page", async ({ page }) => {
    await page.goto("/editorial");
    await page.waitForURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Inloggen" })).toBeVisible();
  });

  test("the login page never sends someone off the site", async ({ page }) => {
    for (const next of ["//evil.example", "/\\evil.example", "https://evil.example"]) {
      await page.goto(`/login?next=${encodeURIComponent(next)}`);
      await page.getByRole("button", { name: /Sanne/ }).click();
      await page.waitForURL(/localhost:3000\/(for-me|dashboard)/);
      expect(new URL(page.url()).hostname).toBe("localhost");
      await page.context().clearCookies();
    }
  });

  test("wrong credentials show a Dutch error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mailadres").fill("sanne@noordlicht.example");
    await page.getByLabel("Wachtwoord").fill("fout-wachtwoord");
    await page.getByRole("button", { name: "Inloggen", exact: true }).click();
    await expect(page.getByText("Onjuist e-mailadres of wachtwoord.")).toBeVisible();
  });
});

test.describe("multi-tenancy", () => {
  test("a new organization starts empty and isolated", async ({ page }) => {
    const errors = trackErrors(page);
    const stamp = Date.now();
    await page.goto("/register");
    await page.getByLabel("Naam van de organisatie").fill(`E2E Testorganisatie ${stamp}`);
    await page.getByLabel("Je naam").fill("Robin Test");
    await page.getByLabel("E-mailadres").fill(`e2e-owner-${stamp}@example.org`);
    await page.getByLabel("Wachtwoord").fill("Een-Sterk-Wachtwoord-2026");
    await page.getByRole("button", { name: "Omgeving aanmaken" }).click();
    await page.waitForURL("**/dashboard", { timeout: 30_000 });
    await expect(page.getByText(/Goede(morgen|middag|navond), Robin/)).toBeVisible();

    // No data from the demo organization is visible; empty states render.
    await expect(page.getByText("Geen open signalen")).toBeVisible();
    await page.goto("/inbox");
    await expect(page.getByText("Rijnmond Logistiek")).toHaveCount(0);
    await page.goto("/editorial");
    await expect(page.getByText("Brouwerij De Koperen Ketel")).toHaveCount(0);
    await page.goto("/agents");
    await expect(page.getByText("Externe Communicatie-agent").first()).toBeVisible();
    await page.goto("/integrations");
    await expect(page.getByText("Niet verbonden").first()).toBeVisible();
    await page.goto("/team");
    await expect(page.getByText("Robin Test").first()).toBeVisible();
    await expect(page.getByText("Sanne de Vries")).toHaveCount(0);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
