import { test, expect } from "@playwright/test";

test.describe("Navigation Guard - Once Option", () => {
  test("handler should only execute once after allowing navigation via router.back()", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Once Option" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: once"
    );

    await page.getByTestId("back-button").click();
    await expect(page.getByTestId("confirm-dialog-confirm")).toBeVisible();
    await expect(page.getByTestId("execution-count")).toHaveText(
      "Handler executed: 1 time(s)"
    );
    await page.getByTestId("confirm-dialog-confirm").click();
    await page.waitForTimeout(500);

    await expect(page).toHaveURL("/");
  });

  test("handler should only execute once after allowing navigation via browser back", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Once Option" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: once"
    );

    await page.goBack();
    await expect(page.getByTestId("confirm-dialog-confirm")).toBeVisible();
    await expect(page.getByTestId("execution-count")).toHaveText(
      "Handler executed: 1 time(s)"
    );
    await page.getByTestId("confirm-dialog-confirm").click();
    await page.waitForTimeout(500);

    await expect(page).toHaveURL("/");
  });

  test("once handler should not run again after first execution, even when blocking", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Once Option" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: once"
    );

    await page.getByTestId("back-button").click();
    await expect(page.getByTestId("confirm-dialog-cancel")).toBeVisible();
    await expect(page.getByTestId("execution-count")).toHaveText(
      "Handler executed: 1 time(s)"
    );
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: once"
    );

    await page.goBack();
    await expect(page.getByTestId("confirm-dialog-cancel")).not.toBeVisible({
      timeout: 2000,
    });
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: once"
    );
    await expect(page.getByTestId("execution-count")).toHaveText(
      "Handler executed: 1 time(s)"
    );

    await page.getByTestId("back-button").click();
    await page.waitForTimeout(500);
    await expect(page).toHaveURL("/");
  });

  test("once handler after refresh - third back should navigate with screen update", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Once Option" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: once"
    );

    await page.reload();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: once"
    );
    await page.waitForTimeout(500);

    await page.goBack();
    await expect(page.getByTestId("confirm-dialog-cancel")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId("execution-count")).toHaveText(
      "Handler executed: 1 time(s)"
    );

    await page.goBack();
    await expect(page.getByTestId("confirm-dialog-cancel")).not.toBeVisible({
      timeout: 2000,
    });
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: once"
    );

    await page.goBack();
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", {
        name: "next-page-router-back-navigation-guard Example",
      })
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Navigation Guard - Enable Option", () => {
  test("handler should work when enabled via router.back()", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Enable Option" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: enable"
    );
    await expect(page.getByTestId("enable-status")).toHaveText(
      "Handler enabled: Yes"
    );

    await page.getByTestId("back-button").click();
    await expect(page.getByTestId("confirm-dialog-cancel")).toBeVisible();
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: enable"
    );
  });

  test("handler should work when enabled via browser back", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Enable Option" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: enable"
    );
    await expect(page.getByTestId("enable-status")).toHaveText(
      "Handler enabled: Yes"
    );

    await page.goBack();
    await expect(page.getByTestId("confirm-dialog-cancel")).toBeVisible();
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: enable"
    );
  });

  test("handler should not work when disabled via router.back()", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Enable Option" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: enable"
    );

    await page.getByTestId("toggle-enable").click();
    await expect(page.getByTestId("enable-status")).toHaveText(
      "Handler enabled: No"
    );

    await page.getByTestId("back-button").click();
    await page.waitForTimeout(500);

    await expect(page).toHaveURL("/");
  });

  test("handler should not work when disabled via browser back", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Enable Option" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: enable"
    );

    await page.getByTestId("toggle-enable").click();
    await expect(page.getByTestId("enable-status")).toHaveText(
      "Handler enabled: No"
    );

    await page.goBack();
    await page.waitForTimeout(500);

    await expect(page).toHaveURL("/");
  });
});
