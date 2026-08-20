import { expect, test } from "@playwright/test";

test("translates every sample token and opens settings", async ({ page }) => {
  await page.route("**/api/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ollama: { available: false, models: [] },
        openaiConfigured: false,
        customEndpointsAllowed: false,
        defaults: {
          ollamaUrl: "http://127.0.0.1:11434",
          ollamaModel: "qwen3:4b",
          openaiBaseUrl: "https://api.openai.com/v1",
          openaiModel: "gpt-5-mini",
        },
      }),
    });
  });
  await page.goto("/");
  await expect(page.getByText("先连接一个语境翻译引擎")).toBeVisible();
  await expect(page.getByRole("button", { name: "配置引擎" })).toBeVisible();
  await page.getByRole("button", { name: "配置后翻译" }).click();
  await expect(page.getByRole("dialog", { name: "设置" })).toBeVisible();
  await page.getByRole("button", { name: "关闭设置" }).click();
  await page.getByLabel("翻译引擎").selectOption("dictionary");
  await page.getByRole("button", { name: "逐词翻译", exact: true }).click();

  await expect(page.getByText("模式说明", { exact: true })).toBeVisible();
  await expect(page.getByText("极速词典只提供逐词查义", { exact: false })).toBeVisible();
  await expect(page.locator(".segment-row")).toHaveCount(52);
  await expect(page.locator(".segment-row").filter({ hasText: "hood" })).toContainText("内部机制");

  await page.getByRole("button", { name: "设置" }).click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("radio", { name: /Ollama/ })).toBeVisible();
  await expect(dialog.getByText("离线逐词查义，不提供可靠整句翻译")).toBeVisible();
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
