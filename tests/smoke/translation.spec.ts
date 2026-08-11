import { expect, test } from "@playwright/test";

test("translates every sample token and opens settings", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("翻译引擎").selectOption("dictionary");
  await page.getByRole("button", { name: "逐词翻译", exact: true }).click();

  await expect(page.getByText("整段翻译", { exact: true })).toBeVisible();
  await expect(page.locator(".segment-row")).toHaveCount(52);
  await expect(page.locator(".segment-row").filter({ hasText: "hood" })).toContainText("内部机制");

  await page.getByRole("button", { name: "翻译引擎设置" }).click();
  const dialog = page.getByRole("dialog", { name: "翻译引擎" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("radio", { name: /Ollama 本地/ })).toBeVisible();
});

test("imports a text document", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "smoke.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Text selected from a smoke test."),
  });

  await expect(page.getByText("smoke.txt")).toBeVisible();
  await expect(page.getByLabel("英文原文")).toHaveValue("Text selected from a smoke test.");
});

test("does not overflow the mobile viewport", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "mobile-only assertion");
  await page.goto("/");
  await page.getByLabel("翻译引擎").selectOption("dictionary");
  await page.getByRole("button", { name: "逐词翻译", exact: true }).click();
  await expect(page.locator(".segment-row")).toHaveCount(52);

  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport);
});
