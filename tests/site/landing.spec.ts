import { expect, test } from "@playwright/test";

test("leads with the available source build and labels the signed-beta waitlist", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/逐词 Wordwise/);
  await expect(page.getByRole("heading", { level: 1, name: "逐词 Wordwise" })).toBeVisible();
  await expect(page.getByText("签名版未就绪，先从源码验证价值。")).toBeVisible();
  await expect(page.getByText("¥39", { exact: true })).toBeVisible();

  const sourceLink = page.getByRole("link", { name: "立即从源码试用" });
  await expect(sourceLink).toHaveAttribute(
    "href",
    "https://github.com/fly1d/wordwise/blob/main/docs/building.md",
  );
  await expect(page.getByRole("link", { name: "加入签名版候补" }).first()).toHaveAttribute(
    "href",
    "https://github.com/fly1d/wordwise/issues/new?template=founder-beta.yml",
  );
  await expect(
    page.getByText("候补登记暂时需要 GitHub 登录，并会创建公开 Issue；", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("签名和公证版安装包还没有准备好。")).toBeVisible();
  await expect(page.getByRole("link", { name: "查看中文构建步骤" })).toHaveAttribute(
    "href",
    "https://github.com/fly1d/wordwise/blob/main/docs/building.md",
  );

  const productImage = page.getByRole("img", { name: "逐词应用的翻译结果界面示例" });
  await expect(productImage).toBeVisible();
  expect(await productImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(1_000);
});

test("fits the mobile viewport without horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  await expect(page.getByRole("link", { name: "加入签名版候补" }).last()).toBeVisible();
});

test("offers an honest English source-build path and signed-beta waitlist", async ({ page }) => {
  await page.goto("/en/");

  await expect(page).toHaveTitle(/Wordwise \| Context-aware/);
  await expect(page.getByRole("heading", { level: 1, name: "Wordwise" })).toBeVisible();
  await expect(page.getByText("The signed and notarized installer is not ready yet.")).toBeVisible();
  await expect(page.getByText("CNY 39", { exact: true })).toBeVisible();

  await expect(page.getByRole("link", { name: "Join the signed-beta waitlist" }).first()).toHaveAttribute(
    "href",
    "https://github.com/fly1d/wordwise/issues/new?template=founder-beta-en.yml",
  );
  await expect(page.getByRole("link", { name: "Build from source now" })).toHaveAttribute(
    "href",
    "https://github.com/fly1d/wordwise/blob/main/docs/building-en.md",
  );
  await expect(page.getByRole("link", { name: "View build instructions" })).toHaveAttribute(
    "href",
    "https://github.com/fly1d/wordwise/blob/main/docs/building-en.md",
  );

  const productImage = page.getByRole("img", { name: "Example of the Wordwise translation results interface" });
  await expect(productImage).toBeVisible();
  expect(await productImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(1_000);
});

test("fits the English page in the mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/en/");
  await expect(page.getByRole("heading", { level: 1, name: "Wordwise" })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
    trustTop: document.querySelector(".trust-strip")?.getBoundingClientRect().top ?? Infinity,
    heroBottom: document.querySelector(".hero")?.getBoundingClientRect().bottom ?? 0,
    lastActionBottom: document.querySelector(".hero-actions a:last-child")?.getBoundingClientRect().bottom ?? Infinity,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.trustTop).toBeLessThan(700);
  expect(dimensions.lastActionBottom).toBeLessThanOrEqual(dimensions.heroBottom);
  await expect(page.getByRole("link", { name: "Join the signed-beta waitlist" }).last()).toBeVisible();
  await expect(page.getByRole("link", { name: "中文" })).toHaveAttribute("href", "../");
});
