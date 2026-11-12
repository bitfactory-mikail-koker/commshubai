import { expect, test, type Locator } from "@playwright/test";
import { login } from "./helpers";

test.use({ colorScheme: "dark" });

const MINIMUM_CONTRAST = 4.5;

async function contrastOf(element: Locator): Promise<number> {
  return element.evaluate((node) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    const rgba = (value: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = "#000";
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: a / 255 };
    };
    const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const channel = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    let background = { r: 0, g: 0, b: 0, a: 0 };
    for (let current: Element | null = node as Element; current; current = current.parentElement) {
      const candidate = rgba(getComputedStyle(current).backgroundColor);
      if (candidate.a > 0) {
        background = candidate;
        break;
      }
    }
    const foreground = rgba(getComputedStyle(node as Element).color);
    const light = Math.max(luminance(foreground), luminance(background));
    const dark = Math.min(luminance(foreground), luminance(background));
    return (light + 0.05) / (dark + 0.05);
  });
}

test("the newsletter e-mail preview stays readable in dark mode", async ({ page }) => {
  await login(page, "sanne@noordlicht.example");
  await page.goto("/newsletters");
  await page.locator("main a[href^='/newsletters/']").first().click();
  await expect(page).toHaveURL(/\/newsletters\/[0-9a-f-]{36}/);

  const mail = page.locator("main article").filter({ has: page.locator("h4") }).first();
  await expect(mail).toBeVisible();
  await expect(mail.locator("h4").first()).toBeVisible();

  for (const selector of ["h3", "h4", "p"]) {
    const sample = mail.locator(`div ${selector}`).first();
    if ((await sample.count()) === 0) continue;
    expect(await contrastOf(sample), `${selector} contrast`).toBeGreaterThanOrEqual(MINIMUM_CONTRAST);
  }
});

test("body text keeps its contrast on the main pages in dark mode", async ({ page }) => {
  await login(page, "sanne@noordlicht.example");
  for (const path of ["/dashboard", "/inbox", "/editorial", "/settings"]) {
    await page.goto(path);
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    expect(await contrastOf(heading), `${path} heading`).toBeGreaterThanOrEqual(MINIMUM_CONTRAST);
  }
});
