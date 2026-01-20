import { test, expect } from "@playwright/test";

test.describe("Navigation Guard - Override Handlers", () => {
  test("single override handler should work via router.back()", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Override Handlers" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: override"
    );

    await page.getByTestId("back-button").click();
    await expect(page.getByRole("heading", { name: "Override Handler 1" })).toBeVisible();
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: override"
    );
  });

  test("single override handler should work via browser back", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Override Handlers" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: override"
    );

    await page.goBack();
    await expect(page.getByRole("heading", { name: "Override Handler 1" })).toBeVisible();
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: override"
    );
  });

  test("lower priority handler should run first via router.back()", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Override Handlers" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: override"
    );

    await page.getByTestId("toggle-handler2").click();
    await expect(page.getByTestId("handler2-status")).toHaveText(
      "Handler 2 active: Yes"
    );

    await page.getByTestId("back-button").click();
    await expect(page.getByRole("heading", { name: "Override Handler 1" })).toBeVisible();
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: override"
    );
  });

  test("lower priority handler should run first via browser back", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Override Handlers" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: override"
    );

    await page.getByTestId("toggle-handler2").click();
    await expect(page.getByTestId("handler2-status")).toHaveText(
      "Handler 2 active: Yes"
    );

    await page.goBack();
    await expect(page.getByRole("heading", { name: "Override Handler 1" })).toBeVisible();
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: override"
    );
  });
});

test.describe("Navigation Guard - Priority Order", () => {
  test("priority 0 should run before priority 1 via router.back()", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Priority Order" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: priority"
    );

    await page.getByTestId("toggle-priority-0").click();
    await expect(page.getByTestId("active-priorities")).toContainText("0");

    await page.getByTestId("back-button").click();
    await expect(page.getByText("Priority 0 Handler")).toBeVisible();
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: priority"
    );
  });

  test("priority 0 should run before priority 1 via browser back", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Priority Order" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: priority"
    );

    await page.getByTestId("toggle-priority-0").click();
    await expect(page.getByTestId("active-priorities")).toContainText("0");

    await page.goBack();
    await expect(page.getByText("Priority 0 Handler")).toBeVisible();
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: priority"
    );
  });

  test("multiple priorities should use lowest first via router.back()", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Priority Order" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: priority"
    );

    await page.getByTestId("toggle-priority-1").click();
    await page.getByTestId("toggle-priority-2").click();
    await page.getByTestId("toggle-priority-3").click();

    await page.getByTestId("back-button").click();
    await expect(page.getByText("Priority 2 Handler")).toBeVisible();
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: priority"
    );
  });

  test("multiple priorities should use lowest first via browser back", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Priority Order" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: priority"
    );

    await page.getByTestId("toggle-priority-1").click();
    await page.getByTestId("toggle-priority-2").click();
    await page.getByTestId("toggle-priority-3").click();

    await page.goBack();
    await expect(page.getByText("Priority 2 Handler")).toBeVisible();
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: priority"
    );
  });
});
