import { expect, test } from "@playwright/test";

test("presents the founder offer and a working application path", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/逐词 Wordwise/);
  await expect(page.getByRole("heading", { level: 1, name: "逐词 Wordwise" })).toBeVisible();
  await expect(page.getByText("先用七天，再决定要不要付。")).toBeVisible();
  await expect(page.getByText("¥39", { exact: true })).toBeVisible();

  const applicationLink = page.getByRole("link", { name: "申请首批测试" });
  await expect(applicationLink).toHaveAttribute(
    "href",
    "https://github.com/fly1d/wordwise/issues/new?template=founder-beta.yml",
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
  await expect(page.getByRole("link", { name: "登记一个测试名额" })).toBeVisible();
});
