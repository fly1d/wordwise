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
  const waitlistLinks = page.getByRole("link", { name: "加入签名版候补" });
  await expect(waitlistLinks).toHaveCount(2);
  for (const link of await waitlistLinks.all()) {
    await expect(link).toHaveAttribute(
      "href",
      "https://tally.so/r/PdZ9ze?source=product-page&language=zh",
    );
  }
  await expect(
    page.getByText(
      "候补答复不会公开；邮箱仅用于 Beta 邀请与支持。表单会记录粗粒度来源和落地页语言元数据，用于漏斗衡量，并由欧盟托管的外部服务 Tally 处理。请勿提交选中文字、文档、API Key 或完整模型请求。需要查询、更正或删除答复时，请使用",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "隐私请求表单" }),
  ).toHaveAttribute("href", "https://tally.so/r/2E9AkL");
  await expect(
    page.getByText(
      "私密候补表单收集资格判断和联系所需的信息，以及粗粒度来源和落地页语言元数据；",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(page.getByText("登记不要求付款，也不保证录取。", { exact: false })).toBeVisible();
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

  const waitlistLinks = page.getByRole("link", { name: "Join the signed-beta waitlist" });
  await expect(waitlistLinks).toHaveCount(2);
  for (const link of await waitlistLinks.all()) {
    await expect(link).toHaveAttribute(
      "href",
      "https://tally.so/r/PdZ9ze?source=product-page&language=en",
    );
  }
  await expect(
    page.getByText(
      "Waitlist responses are private; email is used only for beta invitations and support. The form records coarse source and landing-page language metadata for funnel measurement and is processed by Tally, an external EU-hosted service.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "privacy request form" })).toHaveAttribute(
    "href",
    "https://tally.so/r/2E9AkL",
  );
  await expect(
    page.getByText(
      "The private waitlist form collects the qualification and contact details needed for the beta plus coarse source and landing-page language metadata",
      { exact: false },
    ),
  ).toBeVisible();
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

test("preserves valid campaign sources and rejects malformed values", async ({ page }) => {
  await page.goto("/?source=dev");
  for (const link of await page.getByRole("link", { name: "加入签名版候补" }).all()) {
    await expect(link).toHaveAttribute(
      "href",
      "https://tally.so/r/PdZ9ze?source=dev&language=zh",
    );
  }

  await page.goto("/en/?source=hashnode");
  for (const link of await page.getByRole("link", { name: "Join the signed-beta waitlist" }).all()) {
    await expect(link).toHaveAttribute(
      "href",
      "https://tally.so/r/PdZ9ze?source=hashnode&language=en",
    );
  }

  await page.goto("/?source=dev%26language%3Den");
  await expect(page.getByRole("link", { name: "加入签名版候补" }).first()).toHaveAttribute(
    "href",
    "https://tally.so/r/PdZ9ze?source=product-page&language=zh",
  );
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
