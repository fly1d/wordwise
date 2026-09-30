import { expect, test, type Page } from "@playwright/test";
import type { TranslationResult } from "../../src/types.js";

declare global {
  interface Window {
    translationTest: {
      requests: Array<{
        text: string;
        resolve: (result: TranslationResult) => void;
        reject: (error: Error) => void;
      }>;
      select: (text: string) => Promise<void>;
      root: { unmount: () => void };
      documentRead?: {
        resolve: (text: string) => void;
        reject: (error: Error) => void;
      };
    };
  }
}

test.beforeEach(async ({ page }) => {
  // Keep the real App and its React lifecycle; defer only the platform boundary.
  await page.route("**/src/platform.ts", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `
      window.translationTest = { requests: [] };
      export const isDesktopApp = true;
      export class SelectionShortcutConfigurationError extends Error {}
      export async function getEngineStatus() {
        return {
          ollama: { available: true, models: ["test-model"] },
          openaiConfigured: false,
          customEndpointsAllowed: true,
          defaults: { ollamaUrl: "http://localhost:11434", ollamaModel: "test-model",
            openaiBaseUrl: "https://api.example.test/v1", openaiModel: "test-model" }
        };
      }
      export async function configureSelectionShortcut(shortcut, onSelection) {
        window.translationTest.select = onSelection;
      }
      export function requestTranslation(text) {
        return new Promise((resolve, reject) => {
          window.translationTest.requests.push({ text, resolve, reject });
        });
      }
    `,
  }));
  await page.route("**/src/main.tsx", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    const createRoot = /createRoot\(document\.getElementById\("root"\)\)/;
    expect(body).toMatch(createRoot);
    await route.fulfill({
      response,
      body: body.replace(createRoot, "(window.translationTest.root = $&)"),
    });
  });
  await page.goto("/");
  await expect(page.getByText("将使用 Ollama", { exact: true })).toBeVisible();
});

async function startManual(page: Page) {
  await page.getByLabel("英文原文").fill("Older source A");
  await page.getByRole("button", { name: "逐词翻译", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.translationTest.requests.length)).toBe(1);
}

async function selectNewSource(page: Page) {
  await page.evaluate(() => { void window.translationTest.select("Newer source B"); });
  await expect(page.getByLabel("英文原文")).toHaveValue("Newer source B");
  await expect.poll(() => page.evaluate(() => window.translationTest.requests.length)).toBe(2);
}

async function finish(page: Page, index: number, outcome: "success" | "error") {
  await page.evaluate(async ({ index, outcome }) => {
    const request = window.translationTest.requests[index];
    if (outcome === "error") {
      request.reject(new Error(`Failed: ${request.text}`));
    } else {
      request.resolve({
        fullTranslation: `Translated: ${request.text}`,
        segments: [], engine: "Test model", elapsedMs: 1,
      });
    }
    await new Promise(requestAnimationFrame);
  }, { index, outcome });
}

for (const outcome of ["success", "error"] as const) {
  test(`old ${outcome} cannot finish the newer selection's loading state`, async ({ page }) => {
    await startManual(page);
    await selectNewSource(page);
    await finish(page, 0, outcome);
    await expect(page.getByRole("button", { name: "翻译中", exact: true })).toBeDisabled();
    await expect(page.locator(".error-message")).toHaveCount(0);
    await finish(page, 1, "success");
    await expect(page.locator(".full-translation")).toContainText("Translated: Newer source B");
  });

  test(`old ${outcome} cannot overwrite an already completed newer selection`, async ({ page }) => {
    await startManual(page);
    await selectNewSource(page);
    await finish(page, 1, "success");
    await finish(page, 0, outcome);
    await expect(page.locator(".full-translation")).toContainText("Translated: Newer source B");
    await expect(page.locator(".error-message")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "逐词翻译", exact: true })).toBeEnabled();
  });
}

test("old success cannot replace the current request's failure", async ({ page }) => {
  await startManual(page);
  await selectNewSource(page);
  await finish(page, 1, "error");
  await finish(page, 0, "success");
  await expect(page.locator(".error-message")).toContainText("Failed: Newer source B");
  await expect(page.locator(".full-translation")).toHaveCount(0);
});

for (const change of ["edit", "clear", "import"] as const) {
  for (const outcome of ["success", "error"] as const) {
    test(`${change} invalidates a pending translation's ${outcome}`, async ({ page }) => {
      await startManual(page);
      let source = "Edited source";
      if (change === "edit") {
        await page.getByLabel("英文原文").fill(source);
      } else if (change === "clear") {
        source = "";
        await page.getByRole("button", { name: "清空", exact: true }).click();
      } else {
        source = "Imported source";
        await page.locator('input[type="file"]').setInputFiles({
          name: "new-source.txt", mimeType: "text/plain", buffer: Buffer.from(source),
        });
      }
      await expect(page.getByLabel("英文原文")).toHaveValue(source);
      await finish(page, 0, outcome);
      await expect(page.getByLabel("英文原文")).toHaveValue(source);
      await expect(page.locator(".full-translation, .error-message, .loading-state")).toHaveCount(0);
    });
  }
}

for (const outcome of ["success", "error"] as const) {
  test(`a late document ${outcome} cannot replace a newer source edit`, async ({ page }) => {
    await page.evaluate(() => {
      File.prototype.text = function () {
        return new Promise<string>((resolve, reject) => {
          window.translationTest.documentRead = { resolve, reject };
        });
      };
    });
    await page.locator('input[type="file"]').setInputFiles({
      name: "slow.txt", mimeType: "text/plain", buffer: Buffer.from("Older document"),
    });
    await expect.poll(() => page.evaluate(() => Boolean(window.translationTest.documentRead))).toBe(true);
    await page.getByLabel("英文原文").fill("Edited after import");
    await page.evaluate(async (outcome) => {
      const read = window.translationTest.documentRead!;
      if (outcome === "success") read.resolve("Older document");
      else read.reject(new Error("Old document read failed"));
      await new Promise(requestAnimationFrame);
    }, outcome);
    await expect(page.getByLabel("英文原文")).toHaveValue("Edited after import");
    await expect(page.locator(".file-chip, .error-message")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "导入文档", exact: true })).toBeEnabled();
  });
}

test("ignores a late selection callback after unmount with a pending translation", async ({ page }) => {
  await startManual(page);
  await page.evaluate(() => window.translationTest.root.unmount());
  await finish(page, 0, "error");
  await page.evaluate(() => window.translationTest.select("Late selection"));
  expect(await page.evaluate(() => window.translationTest.requests.length)).toBe(1);
  await expect(page.locator("#root")).toBeEmpty();
});
