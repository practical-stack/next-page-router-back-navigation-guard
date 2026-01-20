import { test, expect } from "@playwright/test";

/**
 * Multi-page Navigation Tests
 *
 * These tests verify that navigation guards work correctly in complex
 * multi-page scenarios including:
 * - Pages without handlers mixed in navigation flow
 * - Page refreshes during navigation
 * - Complex back navigation through multiple pages
 */

test.describe("Multi-page Navigation - No Handler Pages", () => {
  test("should navigate freely through nohandler page via browser back", async ({
    page,
  }) => {
    // Home → nohandler → back to home (no handler should trigger)
    await page.goto("/");
    await page.getByRole("link", { name: "No Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );

    await page.goBack();
    await page.waitForTimeout(500);

    // Should navigate back without any dialog
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", {
        name: "next-page-router-back-navigation-guard Example",
      })
    ).toBeVisible();
  });

  test("should navigate freely through nohandler page via router.back()", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "No Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );

    await page.getByTestId("back-button").click();
    await page.waitForTimeout(500);

    await expect(page).toHaveURL("/");
  });

  test("handler page after nohandler page should still work (direct link)", async ({
    page,
  }) => {
    // Home → nohandler → basic (direct link) → back should trigger handler
    await page.goto("/");
    await page.getByRole("link", { name: "No Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );

    // Use direct link from nohandler to basic
    await page.getByRole("link", { name: "Go to Basic Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );

    // Now back should trigger the handler
    await page.goBack();
    await expect(page.getByTestId("confirm-dialog-cancel")).toBeVisible();
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );
  });
});

test.describe("Multi-page Navigation - Mixed Handler/NoHandler Flow", () => {
  test("home → basic → nohandler (direct) → back (no dialog on nohandler)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Basic Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );

    await page.getByRole("link", { name: "Go to No Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );

    await page.goBack();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );
  });

  test("home → nohandler → basic (direct) → back (should trigger handler)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "No Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );

    await page.getByRole("link", { name: "Go to Basic Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );

    await page.goBack();
    await expect(page.getByTestId("confirm-dialog-cancel")).toBeVisible();
    await page.getByTestId("confirm-dialog-confirm").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );
  });

  test("basic → nohandler → basic (direct links) → multiple backs", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Basic Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );

    await page.getByRole("link", { name: "Go to No Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );

    await page.getByRole("link", { name: "Go to Basic Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );

    await page.goBack();
    await expect(page.getByTestId("confirm-dialog-confirm")).toBeVisible();
    await page.getByTestId("confirm-dialog-confirm").click();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );

    await page.goBack();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );
  });
});

test.describe("Multi-page Navigation - With Refresh", () => {
  test("refresh on nohandler page then back should work normally", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "No Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );

    // Refresh the page
    await page.reload();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );
    await page.waitForTimeout(500);

    // Back should still work (may need to go back twice due to token mismatch)
    await page.goBack();
    await page.waitForTimeout(1000);

    // After refresh, first goBack restores state, second actually navigates
    // But since nohandler has no handler, it should just navigate
    await expect(page).toHaveURL("/");
  });

  test("home → basic → refresh → back should trigger handler", async ({
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
  });

  test("nohandler → basic (direct) → refresh → back should trigger handler", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "No Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );

    await page.getByRole("link", { name: "Go to Basic Handler" }).click();
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
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );
  });

  test("multiple refreshes: home → basic → refresh → refresh → back", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Basic Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );

    // First refresh
    await page.reload();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );
    await page.waitForTimeout(500);

    // Second refresh
    await page.reload();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );
    await page.waitForTimeout(500);

    // Back should still trigger handler
    await page.goBack();
    await expect(page.getByTestId("confirm-dialog-confirm")).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId("confirm-dialog-confirm").click();

    await page.waitForTimeout(1000);
    await expect(page).toHaveURL("/", { timeout: 10000 });
  });
});

test.describe("Multi-page Navigation - Deep History Stack", () => {
  test("basic → nohandler (direct) → back to basic", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Basic Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );

    await page.getByRole("link", { name: "Go to No Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );

    await page.goBack();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );
  });

  test("nohandler → basic (direct) → back to nohandler (confirm)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "No Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );

    await page.getByRole("link", { name: "Go to Basic Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );

    await page.goBack();
    await expect(page.getByTestId("confirm-dialog-confirm")).toBeVisible();
    await page.getByTestId("confirm-dialog-confirm").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );
  });
});

test.describe("Multi-page Navigation - Forward Then Back", () => {
  test("nohandler → basic (direct) → nohandler (direct) → basic (direct) → back chain", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "No Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );

    await page.getByRole("link", { name: "Go to Basic Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );

    await page.getByRole("link", { name: "Go to No Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );

    await page.getByRole("link", { name: "Go to Basic Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );

    await page.goBack();
    await expect(page.getByTestId("confirm-dialog-confirm")).toBeVisible();
    await page.getByTestId("confirm-dialog-confirm").click();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );

    await page.goBack();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );

    await page.goBack();
    await expect(page.getByTestId("confirm-dialog-confirm")).toBeVisible();
    await page.getByTestId("confirm-dialog-confirm").click();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );
  });
});

test.describe("Multi-page Navigation - Refresh at Different Points", () => {
  test("nohandler → refresh → basic (direct) → back", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "No Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );

    await page.reload();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );
    await page.waitForTimeout(500);

    await page.getByRole("link", { name: "Go to Basic Handler" }).click();
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

  test("basic → nohandler (direct) → refresh → basic (direct) → refresh → back", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Basic Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );

    await page.getByRole("link", { name: "Go to No Handler" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );

    await page.reload();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );
    await page.waitForTimeout(500);

    await page.getByRole("link", { name: "Go to Basic Handler" }).click();
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
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: nohandler"
    );
  });
});
