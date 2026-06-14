import { test, expect, type Page } from "@playwright/test";

/**
 * Genuine token-σ session boundary coverage.
 *
 * A "token mismatch" boundary (handleSessionBoundary) fires when back navigation lands on a
 * history entry whose session token differs from the current one. Two shapes exist:
 *   - token-LESS (∅): pre-library / external entries — already covered by multi-page specs.
 *   - token-σ: an entry carrying a *different, non-empty* session token. Within a single
 *     library session every entry shares one token, and refresh restores the token at
 *     module-eval, so this shape never arises naturally in the other specs.
 *
 * To exercise it deterministically we inject a foreign token onto the back-destination entry.
 * The library patches `window.history.replaceState` (an own property on the history instance),
 * so `History.prototype.replaceState` stays native — calling it bypasses the patch and writes
 * a token the library never minted. Going back to that entry then routes through the genuine
 * token-σ branch of handleSessionBoundary (restore via go(1), run handler, leave via back()).
 */

const FOREIGN_TOKEN = "FOREIGN_SESSION_TOKEN_FROM_TEST";
const SESSION_TOKEN_KEY = "__next_session_token";

/**
 * Land on /basic with the previous entry (home) carrying a foreign session token, so that a
 * subsequent back navigation crosses a genuine token-σ boundary. Returns nothing; asserts the
 * injection actually took so the test can't silently degrade into a normal same-token back.
 */
async function setupForeignTokenBoundary(page: Page): Promise<void> {
  await page.goto("/");
  // Ensure the provider has mounted and stamped this entry before we overwrite its token.
  await expect(
    page.getByRole("heading", {
      name: "next-page-router-back-navigation-guard Example",
    })
  ).toBeVisible();

  const injectedToken = await page.evaluate(
    ({ token, key }) => {
      // Native prototype method — bypasses the library's patched window.history.replaceState.
      History.prototype.replaceState.call(
        history,
        { ...history.state, [key]: token },
        "",
        location.href
      );
      return (history.state as Record<string, unknown>)[key];
    },
    { token: FOREIGN_TOKEN, key: SESSION_TOKEN_KEY }
  );
  // Guard: the back-destination entry must genuinely hold the foreign token.
  expect(injectedToken).toBe(FOREIGN_TOKEN);

  await page.getByRole("link", { name: "Basic Handler" }).click();
  await expect(page.getByTestId("page-indicator")).toHaveText(
    "Current Page: basic"
  );
}

test.describe("Navigation Guard - Token-σ Session Boundary", () => {
  test("boundary back shows dialog and blocks on cancel via browser back", async ({
    page,
  }) => {
    await setupForeignTokenBoundary(page);

    await page.goBack();

    // Handler ran across the boundary; URL was restored to /basic via go(1).
    await expect(page.getByText("Basic handler test")).toBeVisible();
    await expect(page).toHaveURL("/basic");
    await page.getByTestId("confirm-dialog-cancel").click();

    await page.waitForTimeout(500);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      "Current Page: basic"
    );
    await expect(page).toHaveURL("/basic");
  });

  test("boundary back allows navigation on confirm via browser back (leave path)", async ({
    page,
  }) => {
    await setupForeignTokenBoundary(page);

    await page.goBack();

    await expect(page.getByTestId("confirm-dialog-confirm")).toBeVisible();
    await expect(page).toHaveURL("/basic");
    await page.getByTestId("confirm-dialog-confirm").click();

    await page.waitForTimeout(500);
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", {
        name: "next-page-router-back-navigation-guard Example",
      })
    ).toBeVisible();
  });

  test("boundary back allows navigation on confirm via router.back() (leave path)", async ({
    page,
  }) => {
    await setupForeignTokenBoundary(page);

    await page.getByTestId("back-button").click();

    await expect(page.getByTestId("confirm-dialog-confirm")).toBeVisible();
    await expect(page).toHaveURL("/basic");
    await page.getByTestId("confirm-dialog-confirm").click();

    await page.waitForTimeout(500);
    await expect(page).toHaveURL("/");
  });
});
