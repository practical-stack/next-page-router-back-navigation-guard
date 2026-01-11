import { test, expect } from "@playwright/test";

test.describe("Navigation Guard - Basic Handler Test Page", () => {
  test("should show dialog and block on cancel", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Basic Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: basic");

    await page.getByTestId("back-button").click();
    
    await expect(page.getByText("Basic handler test")).toBeVisible();
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: basic");
  });

  test("should allow navigation on confirm", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Basic Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: basic");

    await page.getByTestId("back-button").click();
    
    await expect(page.getByTestId("confirm-dialog-confirm")).toBeVisible();
    await page.getByTestId("confirm-dialog-confirm").click();

    await page.waitForTimeout(500);
    await expect(page).toHaveURL("/");
  });
});

test.describe("Navigation Guard - Once Option", () => {
  test("handler should only execute once", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Once Option" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: once");

    await page.getByTestId("back-button").click();
    await expect(page.getByTestId("confirm-dialog-cancel")).toBeVisible();
    await expect(page.getByTestId("execution-count")).toHaveText("Handler executed: 1 time(s)");
    await page.getByTestId("confirm-dialog-cancel").click();
    await page.waitForTimeout(500);

    await page.getByTestId("back-button").click();
    await page.waitForTimeout(500);
    
    await expect(page).toHaveURL("/");
  });
});

test.describe("Navigation Guard - Enable Option", () => {
  test("handler should work when enabled", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Enable Option" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: enable");
    await expect(page.getByTestId("enable-status")).toHaveText("Handler enabled: Yes");

    await page.getByTestId("back-button").click();
    await expect(page.getByTestId("confirm-dialog-cancel")).toBeVisible();
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: enable");
  });

  test("handler should not work when disabled", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Enable Option" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: enable");

    await page.getByTestId("toggle-enable").click();
    await expect(page.getByTestId("enable-status")).toHaveText("Handler enabled: No");

    await page.getByTestId("back-button").click();
    await page.waitForTimeout(500);
    
    await expect(page).toHaveURL("/");
  });
});

test.describe("Navigation Guard - Override Handlers", () => {
  test("single override handler should work", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Override Handlers" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: override");

    await page.getByTestId("back-button").click();
    await expect(page.getByText("Override Handler 1")).toBeVisible();
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: override");
  });

  test("lower priority handler should run first", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Override Handlers" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: override");

    await page.getByTestId("toggle-handler2").click();
    await expect(page.getByTestId("handler2-status")).toHaveText("Handler 2 active: Yes");

    await page.getByTestId("back-button").click();
    await expect(page.getByText("Override Handler 1")).toBeVisible();
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: override");
  });
});

test.describe("Navigation Guard - Priority Order", () => {
  test("priority 0 should run before priority 1", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Priority Order" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: priority");

    await page.getByTestId("toggle-priority-0").click();
    await expect(page.getByTestId("active-priorities")).toContainText("0");

    await page.getByTestId("back-button").click();
    await expect(page.getByText("Priority 0 Handler")).toBeVisible();
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: priority");
  });

  test("multiple priorities should use lowest first", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Priority Order" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: priority");

    await page.getByTestId("toggle-priority-1").click();
    await page.getByTestId("toggle-priority-2").click();
    await page.getByTestId("toggle-priority-3").click();

    await page.getByTestId("back-button").click();
    await expect(page.getByText("Priority 2 Handler")).toBeVisible();
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: priority");
  });
});

test.describe("Navigation Guard - Pre-registered Handler", () => {
  test("regular handler on pre-registered page should show dialog", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Pre-registered Handler$/ }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: pre-registered");

    await page.getByTestId("back-button").click();
    await expect(page.getByRole("heading", { name: "Regular Handler" })).toBeVisible();
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: pre-registered");
  });
});

test.describe("Navigation Guard - Pre-registered Handler (Overlay Close)", () => {
  test("preRegisteredHandler should close overlay and block navigation", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Basic Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: basic");

    await page.getByTestId("back-button").click();
    await expect(page.getByTestId("confirm-dialog-cancel")).toBeVisible();

    await page.goBack();
    
    await expect(page.getByTestId("confirm-dialog-cancel")).not.toBeVisible({ timeout: 2000 });
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: basic");
  });
});

test.describe("Navigation Guard - Browser Back Button", () => {
  test("browser back should trigger handler", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Basic Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: basic");

    await page.goBack();
    
    await expect(page.getByTestId("confirm-dialog-cancel")).toBeVisible();
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: basic");
  });
});

test.describe("Navigation Guard - After Refresh (Token Mismatch)", () => {

  test("should allow navigation after refresh when dialog is confirmed", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Basic Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: basic");

    await page.reload();
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: basic");
    await page.waitForTimeout(500);

    await page.goBack();
    
    await expect(page.getByTestId("confirm-dialog-confirm")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("confirm-dialog-confirm").click();

    await page.waitForTimeout(1000);
    await expect(page).toHaveURL("/", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "next-page-router-back-navigation-guard Example" })).toBeVisible({ timeout: 5000 });
  });

  test("should block navigation after refresh when dialog is cancelled", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Basic Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: basic");

    await page.reload();
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: basic");
    await page.waitForTimeout(500);

    await page.goBack();
    
    await expect(page.getByTestId("confirm-dialog-cancel")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText("Current Page: basic");
    await expect(page).toHaveURL("/basic");
  });
});
