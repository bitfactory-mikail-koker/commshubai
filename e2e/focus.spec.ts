import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const MINIMUM_RING_CONTRAST = 3;

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("the keyboard focus ring is visible against the page", async ({ page }) => {
      await login(page, "sanne@noordlicht.example");
      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const seen: { ratio: number; element: string }[] = [];
      for (let step = 0; step < 14; step++) {
        await page.keyboard.press("Tab");
        const measured = await page.evaluate(() => {
          const element = document.activeElement as HTMLElement | null;
          if (!element || element === document.body || !element.matches(":focus-visible")) return null;
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
          let background = rgba(getComputedStyle(document.documentElement).backgroundColor);
          for (let current: Element | null = element.parentElement; current; current = current.parentElement) {
            const candidate = rgba(getComputedStyle(current).backgroundColor);
            if (candidate.a > 0.9) {
              background = candidate;
              break;
            }
          }
          const style = getComputedStyle(element);
          const shadows: string[] = [];
          let depth = 0;
          let start = 0;
          for (let index = 0; index < style.boxShadow.length; index++) {
            const character = style.boxShadow[index];
            if (character === "(") depth++;
            else if (character === ")") depth--;
            else if (character === "," && depth === 0) {
              shadows.push(style.boxShadow.slice(start, index).trim());
              start = index + 1;
            }
          }
          shadows.push(style.boxShadow.slice(start).trim());
          const ringShadow = shadows.find((shadow) => {
            const lengths = shadow.replace(/(rgba?|oklab|oklch|lab|lch|color|hsl)\([^)]*\)/g, "").match(/-?[\d.]+px/g) ?? [];
            return lengths.length >= 4 && parseFloat(lengths[3]) >= 2 && !shadow.includes("inset");
          });
          const shadowColor = ringShadow?.match(/((?:rgba?|oklab|oklch|lab|lch|color|hsl)\([^)]*\))/)?.[1];
          const outlineVisible = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2;
          const source = shadowColor ?? (outlineVisible ? style.outlineColor : null);
          if (!source) return { ratio: 0, element: `${element.tagName} ${element.getAttribute("aria-label") ?? element.textContent?.slice(0, 24)}` };
          const ring = rgba(source);
          const blended = {
            r: ring.r * ring.a + background.r * (1 - ring.a),
            g: ring.g * ring.a + background.g * (1 - ring.a),
            b: ring.b * ring.a + background.b * (1 - ring.a),
          };
          const light = Math.max(luminance(blended), luminance(background));
          const dark = Math.min(luminance(blended), luminance(background));
          return { ratio: (light + 0.05) / (dark + 0.05), element: `${element.tagName} ${element.getAttribute("aria-label") ?? element.textContent?.slice(0, 24)}` };
        });
        if (measured) seen.push(measured);
      }

      expect(seen.length).toBeGreaterThan(5);
      const weak = seen.filter((entry) => entry.ratio < MINIMUM_RING_CONTRAST);
      expect(weak, `focus rings below ${MINIMUM_RING_CONTRAST}:1`).toEqual([]);
    });
  });
}
