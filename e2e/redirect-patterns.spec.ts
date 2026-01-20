import { test, expect } from "@playwright/test";

test.describe("Safe Redirect Pattern (redirect-safe)", () => {
  test("should show modal and redirect on confirm via router.back()", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Safe Redirect Pattern" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: redirect-safe"
    );

    await page.getByTestId("back-button").click();
    await expect(page.getByTestId("redirect-confirm")).toBeVisible();

    await page.getByTestId("redirect-confirm").click();
    await page.waitForTimeout(500);

    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );
  });

  test("should show modal and redirect on confirm via browser back", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Safe Redirect Pattern" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: redirect-safe"
    );

    await page.goBack();
    await expect(page.getByTestId("redirect-confirm")).toBeVisible();

    await page.getByTestId("redirect-confirm").click();
    await page.waitForTimeout(500);

    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );
  });

  test("should work correctly after refresh via router.back()", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Safe Redirect Pattern" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: redirect-safe"
    );

    await page.reload();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: redirect-safe"
    );
    await page.waitForTimeout(500);

    await page.getByTestId("back-button").click();
    await expect(page.getByTestId("redirect-confirm")).toBeVisible({
      timeout: 10000,
    });

    await page.getByTestId("redirect-confirm").click();
    await page.waitForTimeout(500);

    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );
  });

  test("should work correctly after refresh via browser back", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Safe Redirect Pattern" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: redirect-safe"
    );

    await page.reload();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: redirect-safe"
    );
    await page.waitForTimeout(500);

    await page.goBack();
    await expect(page.getByTestId("redirect-confirm")).toBeVisible({
      timeout: 10000,
    });

    await page.getByTestId("redirect-confirm").click();
    await page.waitForTimeout(500);

    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );
  });

  test("redirect → back → redirect-safe should work correctly", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Safe Redirect Pattern" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: redirect-safe"
    );

    await page.goBack();
    await expect(page.getByTestId("redirect-confirm")).toBeVisible();
    await page.getByTestId("redirect-confirm").click();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );

    await page.goBack();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: redirect-safe"
    );

    await page.goBack();
    await expect(page.getByTestId("redirect-confirm")).toBeVisible();
    await page.getByTestId("redirect-confirm").click();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );
  });
});

test.describe("Unsafe Redirect Pattern (redirect) - Known Limitations", () => {
  test("basic redirect works via router.back()", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Redirect on Back" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: redirect"
    );

    await page.getByTestId("back-button").click();
    await page.waitForTimeout(500);

    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );
  });

  test("basic redirect works via browser back", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Redirect on Back" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: redirect"
    );

    await page.goBack();
    await page.waitForTimeout(500);

    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );
  });

  test("redirect works after refresh via router.back()", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Redirect on Back" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: redirect"
    );

    await page.reload();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: redirect"
    );
    await page.waitForTimeout(500);

    await page.getByTestId("back-button").click();
    await page.waitForTimeout(1000);

    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );
  });
});
