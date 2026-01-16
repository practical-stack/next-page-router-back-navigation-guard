export const DEBUG =
  typeof process !== "undefined" &&
  process.env &&
  process.env.NEXT_PAGE_ROUTER_BACK_NAVIGATION_GUARD_DEBUG === "true";

export const debug = (...args: any[]) => {
  if (DEBUG) {
    console.log("[next-page-router-back-navigation-guard]", ...args);
  }
};
