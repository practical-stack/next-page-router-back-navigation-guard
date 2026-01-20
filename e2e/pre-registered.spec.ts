import { test, expect } from "@playwright/test";

test.describe("Navigation Guard - Pre-registered Handler", () => {
  test("regular handler on pre-registered page should show dialog via router.back()", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Pre-registered Handler$/ }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: pre-registered"
    );

    await page.getByTestId("back-button").click();
    await expect(
      page.getByRole("heading", { name: "Regular Handler" })
    ).toBeVisible();
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: pre-registered"
    );
  });

  test("regular handler on pre-registered page should show dialog via browser back", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Pre-registered Handler$/ }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: pre-registered"
    );

    await page.goBack();
    await expect(
      page.getByRole("heading", { name: "Regular Handler" })
    ).toBeVisible();
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: pre-registered"
    );
  });
});

test.describe("Navigation Guard - Pre-registered Handler (Overlay Close)", () => {
  test("preRegisteredHandler should close overlay and block navigation", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Basic Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );

    await page.getByTestId("back-button").click();
    await expect(page.getByTestId("confirm-dialog-cancel")).toBeVisible();

    await page.goBack();

    await expect(page.getByTestId("confirm-dialog-cancel")).not.toBeVisible({
      timeout: 2000,
    });
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );
  });
});
