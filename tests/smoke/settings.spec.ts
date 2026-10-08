import { expect, test, type Page } from "@playwright/test";

const configuredStatus = {
  ollama: { available: false, models: [] },
  openaiConfigured: true,
  customEndpointsAllowed: false,
  defaults: {
    ollamaUrl: "http://127.0.0.1:11435",
    ollamaModel: "configured-local",
    openaiBaseUrl: "https://gateway.example.test/v1",
    openaiModel: "compatible-model",
  },
};

async function expectTranslationSettings(page: Page, expectedModel: string) {
  await page.route("**/api/translate", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      fullTranslation: "你好",
      segments: [{ id: 0, source: "Hello", kind: "word", translation: "你好" }],
      engine: "Test gateway",
      elapsedMs: 1,
    }),
  }));
  await page.getByLabel("英文原文").fill("Hello");
  await page.getByLabel("翻译引擎").selectOption("openai");
  const requestPromise = page.waitForRequest("**/api/translate");
  await page.getByRole("button", { name: "逐词翻译", exact: true }).click();
  const request = await requestPromise;
  expect(request.postDataJSON().settings).toMatchObject({
    openaiBaseUrl: configuredStatus.defaults.openaiBaseUrl,
    openaiModel: expectedModel,
    openaiApiKey: "",
  });
  await expect(page.getByText("你好", { exact: true }).first()).toBeVisible();
}

test("first translation uses the server-configured model", async ({ page }) => {
  await page.route("**/api/status", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(configuredStatus),
  }));
  await page.goto("/");
  await page.getByLabel("翻译引擎").selectOption("openai");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await expect(dialog.getByLabel("模型", { exact: true })).toHaveValue("compatible-model");
  await expect(dialog.getByLabel("API 地址", { exact: true })).toHaveValue(configuredStatus.defaults.openaiBaseUrl);
  await page.getByRole("button", { name: "关闭设置" }).click();
  await expectTranslationSettings(page, "compatible-model");
});

test("saved models survive initialization while Web addresses and API-key storage stay constrained", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("wordwise-settings", JSON.stringify({
    openaiModel: "saved-model",
    openaiBaseUrl: "https://saved-browser.example.test/v1",
    openaiApiKey: "synthetic-stored-key",
  })));
  await page.route("**/api/status", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(configuredStatus),
  }));
  await page.goto("/");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await expect(dialog.getByLabel("API 地址", { exact: true })).toHaveValue(configuredStatus.defaults.openaiBaseUrl);
  await expect(dialog.getByLabel("API Key", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "关闭设置" }).click();
  await expectTranslationSettings(page, "saved-model");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("wordwise-settings") ?? "{}")))
    .not.toHaveProperty("openaiApiKey");
});

test("a delayed status response preserves an explicit model edit but still locks Web addresses", async ({ page }) => {
  let releaseStatus = () => {};
  const statusReady = new Promise<void>((resolve) => { releaseStatus = resolve; });
  await page.route("**/api/status", async (route) => {
    await statusReady;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(configuredStatus) });
  });
  await page.goto("/");
  await page.getByLabel("翻译引擎").selectOption("openai");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  const model = dialog.getByLabel("模型", { exact: true });
  await model.fill("temporary-choice");
  await model.fill("gpt-5-mini");
  await dialog.getByLabel("API 地址", { exact: true }).fill("https://edited-browser.example.test/v1");
  releaseStatus();
  await expect(dialog.getByLabel("API 地址", { exact: true })).toHaveValue(configuredStatus.defaults.openaiBaseUrl);
  await expect(dialog.getByLabel("API 地址", { exact: true })).toHaveAttribute("readonly", "");
  await expect(model).toHaveValue("gpt-5-mini");
  await page.getByRole("button", { name: "关闭设置" }).click();
  await expectTranslationSettings(page, "gpt-5-mini");
  await page.reload();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "设置" }).getByLabel("模型", { exact: true }))
    .toHaveValue("gpt-5-mini");
  await page.getByRole("button", { name: "关闭设置" }).click();
  await expectTranslationSettings(page, "gpt-5-mini");
});

test("a failed first status request does not pin fallback models after reloading", async ({ page }) => {
  let firstLoad = true;
  await page.route("**/api/status", (route) => route.fulfill(firstLoad ? {
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "Synthetic first-load failure" }),
  } : {
    contentType: "application/json",
    body: JSON.stringify(configuredStatus),
  }));
  const failedStatus = page.waitForResponse((response) => response.url().endsWith("/api/status") && response.status() === 503);
  await page.goto("/");
  await failedStatus;
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("wordwise-settings") ?? "{}")))
    .toEqual({ provider: "auto" });
  firstLoad = false;
  await page.reload();
  await page.getByLabel("翻译引擎").selectOption("openai");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "设置" }).getByLabel("模型", { exact: true }))
    .toHaveValue("compatible-model");
  await page.getByRole("button", { name: "关闭设置" }).click();
  await expectTranslationSettings(page, "compatible-model");
});

test("reloading while first status is pending does not save fallback models as user choices", async ({ page }) => {
  let pending = true;
  let releasePending = () => {};
  let markPendingRequested = () => {};
  const pendingDone = new Promise<void>((resolve) => { releasePending = resolve; });
  const pendingRequested = new Promise<void>((resolve) => { markPendingRequested = resolve; });
  await page.route("**/api/status", async (route) => {
    if (pending) {
      markPendingRequested();
      await pendingDone;
      await route.abort("failed").catch(() => {});
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(configuredStatus) });
  });
  await page.goto("/");
  await pendingRequested;
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("wordwise-settings") ?? "{}")))
    .toEqual({ provider: "auto" });
  pending = false;
  const reloaded = page.reload();
  releasePending();
  await reloaded;
  await page.getByLabel("翻译引擎").selectOption("openai");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "设置" }).getByLabel("模型", { exact: true }))
    .toHaveValue("compatible-model");
  await page.getByRole("button", { name: "关闭设置" }).click();
  await expectTranslationSettings(page, "compatible-model");
});

test("automatically selected defaults continue following server configuration after reopening", async ({ page }) => {
  let configuredModel = "compatible-model";
  await page.route("**/api/status", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ ...configuredStatus, defaults: { ...configuredStatus.defaults, openaiModel: configuredModel } }),
  }));
  await page.goto("/");
  await page.getByLabel("翻译引擎").selectOption("openai");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "设置" }).getByLabel("模型", { exact: true }))
    .toHaveValue("compatible-model");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("wordwise-settings") ?? "{}")))
    .toEqual({ provider: "openai" });
  configuredModel = "compatible-model-v2";
  await page.reload();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "设置" }).getByLabel("模型", { exact: true }))
    .toHaveValue("compatible-model-v2");
  await page.getByRole("button", { name: "关闭设置" }).click();
  await expectTranslationSettings(page, "compatible-model-v2");
});
