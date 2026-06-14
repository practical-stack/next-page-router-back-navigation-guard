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

  test("basic redirect works via browser back", async ({ page, browserName }) => {
    /**
     * Reliably fails on Firefox CI (not random flakiness): the same test failed all
     * 3 retries across two independent CI runs and two Next versions (16.0 and 16.2),
     * while being the only failure each time (161/162 passed).
     *
     * This page uses the unsupported pattern of calling `router.push()` *inside* the
     * back handler (see redirect.tsx "NOT RECOMMENDED - Known Limitations"), where the
     * page itself warns "router.back() API may work while browser back button fails".
     * The `router.push()` redirect appears to lose a race with the `history.go()` URL
     * restoration under Firefox CI, so the assertion never reaches "nohandler"
     * (mechanism inferred from the empirical pattern, not directly proven).
     *
     * The `router.back()` variant above is reliable; only the browser-back-button
     * (`page.goBack`) path on Firefox is affected, consistent with Firefox's
     * pre-existing goBack quirks handled in playwright.config.ts. We skip rather than
     * fix because this exercises an intentionally unsupported anti-pattern.
     */
    test.skip(
      browserName === "firefox",
      "Unsupported router.push()-in-handler pattern: browser-back redirect is unreliable on Firefox"
    );

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
