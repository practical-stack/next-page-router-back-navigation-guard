export const DEBUG = false;

export const debug = (...args: any[]) => {
  if (DEBUG) {
    console.log("[next-page-router-back-navigation-guard]", ...args);
  }
};
