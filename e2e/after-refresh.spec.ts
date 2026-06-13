import { test, expect } from "@playwright/test";

test.describe("Navigation Guard - Browser Back Button", () => {
  test("browser back should trigger handler", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Basic Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );

    await page.goBack();

    await expect(page.getByTestId("confirm-dialog-cancel")).toBeVisible();
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );
  });
});

test.describe("Navigation Guard - After Refresh (Token Mismatch)", () => {
  test("should allow navigation after refresh when dialog is confirmed", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Basic Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );

    await page.reload();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );
    await page.waitForTimeout(500);

    await page.goBack();

    await expect(page.getByTestId("confirm-dialog-confirm")).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId("confirm-dialog-confirm").click();

    await page.waitForTimeout(1000);
    await expect(page).toHaveURL("/", { timeout: 10000 });
    await expect(
      page.getByRole("heading", {
        name: "next-page-router-back-navigation-guard Example",
      })
    ).toBeVisible({ timeout: 5000 });
  });

  test("should block navigation after refresh when dialog is cancelled", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Basic Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );

    await page.reload();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );
    await page.waitForTimeout(500);

    await page.goBack();

    await expect(page.getByTestId("confirm-dialog-cancel")).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );
    await expect(page).toHaveURL("/basic");
  });

  test("should handle double back after refresh - second back closes modal via preRegisteredHandler", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Basic Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );

    await page.reload();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );
    await page.waitForTimeout(500);

    await page.goBack();
    await expect(page.getByTestId("confirm-dialog-cancel")).toBeVisible({
      timeout: 10000,
    });
    await page.waitForTimeout(500);

    await page.goBack();
    await page.waitForTimeout(1000);
    await expect(page.getByTestId("confirm-dialog-cancel")).not.toBeVisible({
      timeout: 5000,
    });

    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );
    await expect(page).toHaveURL("/basic");
  });

  test("forward navigation after refresh should be allowed (not misdetected as back)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Basic Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );

    // Go back to home (confirm), leaving /basic as the forward entry.
    await page.goBack();
    await expect(page.getByTestId("confirm-dialog-confirm")).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page).toHaveURL("/", { timeout: 10000 });

    // Refresh on home, then go forward to /basic.
    await page.reload();
    await page.waitForTimeout(500);

    await page.goForward();

    // Forward must land on /basic without the guard dialog firing.
    await expect(page).toHaveURL("/basic", { timeout: 10000 });
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );
    await expect(page.getByTestId("confirm-dialog-confirm")).not.toBeVisible();

    // And a subsequent back must still correctly trigger the guard.
    await page.goBack();
    await expect(page.getByTestId("confirm-dialog-confirm")).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId("confirm-dialog-cancel").click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );
  });
});
